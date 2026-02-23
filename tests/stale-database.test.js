/**
 * Tests for stale listing database operations:
 * - markStaleListings
 * - cleanupStaleListings
 * - bulkUpsertListings (stale_since: null in $set)
 */

// Mock MongoDB and logger before requiring database module
const mockCollection = {
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
  deleteMany: jest.fn(),
  bulkWrite: jest.fn(),
  createIndex: jest.fn().mockResolvedValue(),
  find: jest.fn(),
};

const mockDb = {
  collection: jest.fn(() => mockCollection),
};

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(),
    db: jest.fn(() => mockDb),
  })),
}));

jest.mock('../src/lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../src/lib/database');

beforeAll(async () => {
  await db.connect();
});

beforeEach(() => {
  jest.clearAllMocks();
  // Re-bind collection mock after clearAllMocks
  mockDb.collection.mockReturnValue(mockCollection);
});

// ─── markStaleListings ──────────────────────────────────────

describe('markStaleListings', () => {
  test('Normal: 100 active, crawled 80 -> marks stale and clears recovered', async () => {
    mockCollection.countDocuments.mockResolvedValue(100);
    mockCollection.updateMany
      .mockResolvedValueOnce({ modifiedCount: 20 })  // mark stale
      .mockResolvedValueOnce({ modifiedCount: 0 });   // clear recovered

    const activeIds = Array.from({ length: 80 }, (_, i) => `id_${i}`);
    const result = await db.markStaleListings('pf', activeIds);

    expect(result.marked).toBe(20);
    expect(result.cleared).toBe(0);
    expect(result.skipped).toBe(false);

    // Verify mark stale call
    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { listing_id: { $nin: expect.any(Array) }, stale_since: null },
      { $set: { stale_since: expect.any(Date) } },
    );

    // Verify clear recovered call
    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { listing_id: { $in: expect.any(Array) }, stale_since: { $ne: null } },
      { $set: { stale_since: null } },
    );
  });

  test('Safety valve: crawled <50% of active -> skips marking', async () => {
    mockCollection.countDocuments.mockResolvedValue(100);

    const activeIds = Array.from({ length: 30 }, (_, i) => `id_${i}`);
    const result = await db.markStaleListings('pf', activeIds);

    expect(result.skipped).toBe(true);
    expect(result.marked).toBe(0);
    expect(result.cleared).toBe(0);
    expect(mockCollection.updateMany).not.toHaveBeenCalled();

    // Verify countDocuments filters by active (stale_since: null)
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({ stale_since: null });
  });

  test('Safety valve: exactly 50% passes', async () => {
    mockCollection.countDocuments.mockResolvedValue(100);
    mockCollection.updateMany
      .mockResolvedValueOnce({ modifiedCount: 50 })
      .mockResolvedValueOnce({ modifiedCount: 0 });

    const activeIds = Array.from({ length: 50 }, (_, i) => `id_${i}`);
    const result = await db.markStaleListings('pf', activeIds);

    expect(result.skipped).toBe(false);
    expect(mockCollection.updateMany).toHaveBeenCalledTimes(2);
  });

  test('Recovery: previously stale listings reappear -> stale_since cleared', async () => {
    mockCollection.countDocuments.mockResolvedValue(100);
    mockCollection.updateMany
      .mockResolvedValueOnce({ modifiedCount: 0 })   // no new stale
      .mockResolvedValueOnce({ modifiedCount: 5 });   // 5 recovered

    const activeIds = Array.from({ length: 100 }, (_, i) => `id_${i}`);
    const result = await db.markStaleListings('pf', activeIds);

    expect(result.cleared).toBe(5);
    expect(result.marked).toBe(0);
  });

  test('Empty collection: no error, proceeds normally', async () => {
    mockCollection.countDocuments.mockResolvedValue(0);
    mockCollection.updateMany
      .mockResolvedValueOnce({ modifiedCount: 0 })
      .mockResolvedValueOnce({ modifiedCount: 0 });

    // Empty DB + empty activeIds: 0 < 0 * 0.5 is false, so it proceeds
    const result = await db.markStaleListings('pf', []);

    expect(result.skipped).toBe(false);
  });

  test('Per-platform isolation: PF call uses propertyfinder_raw', async () => {
    mockCollection.countDocuments.mockResolvedValue(10);
    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });

    await db.markStaleListings('pf', Array.from({ length: 10 }, (_, i) => `id_${i}`));
    expect(mockDb.collection).toHaveBeenCalledWith('propertyfinder_raw');
  });

  test('Per-platform isolation: dubizzle call uses dubizzle_raw', async () => {
    mockCollection.countDocuments.mockResolvedValue(10);
    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });

    await db.markStaleListings('dubizzle', Array.from({ length: 10 }, (_, i) => `id_${i}`));
    expect(mockDb.collection).toHaveBeenCalledWith('dubizzle_raw');
  });

  test('Unknown source throws error', async () => {
    await expect(db.markStaleListings('zillow', ['id1'])).rejects.toThrow('Unknown source');
  });
});

// ─── cleanupStaleListings ───────────────────────────────────

describe('cleanupStaleListings', () => {
  test('Deletes records stale for more than 7 days', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 5 });

    const deleted = await db.cleanupStaleListings('pf', 7);

    expect(deleted).toBe(5);
    expect(mockCollection.deleteMany).toHaveBeenCalledWith({
      stale_since: { $lte: expect.any(Date) },
    });

    // Verify cutoff date is approximately 7 days ago
    const cutoffArg = mockCollection.deleteMany.mock.calls[0][0].stale_since.$lte;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(Date.now() - cutoffArg.getTime()).toBeCloseTo(sevenDaysMs, -3); // within ~1s
  });

  test('Returns 0 when no stale records exist', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });

    const deleted = await db.cleanupStaleListings('pf');

    expect(deleted).toBe(0);
  });

  test('Default threshold is 7 days', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });

    await db.cleanupStaleListings('pf');

    const cutoffArg = mockCollection.deleteMany.mock.calls[0][0].stale_since.$lte;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(Date.now() - cutoffArg.getTime()).toBeCloseTo(sevenDaysMs, -3);
  });

  test('Custom threshold: 14 days', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 3 });

    const deleted = await db.cleanupStaleListings('bayut', 14);

    expect(deleted).toBe(3);
    const cutoffArg = mockCollection.deleteMany.mock.calls[0][0].stale_since.$lte;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(Date.now() - cutoffArg.getTime()).toBeCloseTo(fourteenDaysMs, -3);
  });
});

// ─── bulkUpsertListings (stale_since: null) ─────────────────

describe('bulkUpsertListings stale_since reset', () => {
  test('Upsert includes stale_since: null in $set', async () => {
    mockCollection.bulkWrite.mockResolvedValue({
      upsertedCount: 1,
      modifiedCount: 0,
    });

    // PF adapter expects listing_type + property.id
    await db.bulkUpsertListings('pf', [
      { listing_type: 'property', property: { id: 'abc123', title: 'Test' } },
    ]);

    const bulkOps = mockCollection.bulkWrite.mock.calls[0][0];
    expect(bulkOps[0].updateOne.update.$set).toHaveProperty('stale_since', null);
  });

  test('Existing stale listing gets stale_since cleared on re-upsert', async () => {
    mockCollection.bulkWrite.mockResolvedValue({
      upsertedCount: 0,
      modifiedCount: 1,
    });

    await db.bulkUpsertListings('dubizzle', [
      { id: 'dub456', price: 60000 },
    ]);

    const bulkOps = mockCollection.bulkWrite.mock.calls[0][0];
    expect(bulkOps[0].updateOne.update.$set.stale_since).toBeNull();
  });
});
