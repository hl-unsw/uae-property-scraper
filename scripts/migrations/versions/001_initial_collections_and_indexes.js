/**
 * Migration 001: Initial collections and indexes
 *
 * Creates the three source collections with unique listing_id indexes
 * and the compound indexes needed for API queries.
 */

const COLLECTIONS = ['propertyfinder_raw', 'dubizzle_raw', 'bayut_raw'];

module.exports = {
  description: 'Create collections and base indexes (listing_id unique, crawled_at, location+price)',

  async up(db) {
    // Ensure collections exist
    const existing = await db.listCollections().toArray();
    const existingNames = new Set(existing.map((c) => c.name));

    for (const name of COLLECTIONS) {
      if (!existingNames.has(name)) {
        await db.createCollection(name);
      }
    }

    // Unique index on listing_id for all collections
    // Drop any existing auto-named index first, then create with our name
    for (const name of COLLECTIONS) {
      const col = db.collection(name);
      const indexes = await col.indexes();
      for (const idx of indexes) {
        if (idx.key?.listing_id === 1 && idx.name !== 'idx_listing_id_unique') {
          await col.dropIndex(idx.name).catch(() => {});
        }
      }
      await col.createIndex(
        { listing_id: 1 },
        { unique: true, name: 'idx_listing_id_unique' }
      );
    }

    // Property Finder specific indexes
    const pf = db.collection('propertyfinder_raw');

    // Drop auto-named versions if they exist
    const pfIndexes = await pf.indexes();
    for (const idx of pfIndexes) {
      const key = JSON.stringify(idx.key);
      if (
        (key.includes('full_name') && idx.name !== 'idx_location_price') ||
        (key === '{"crawled_at":-1}' && idx.name !== 'idx_crawled_at_desc')
      ) {
        await pf.dropIndex(idx.name).catch(() => {});
      }
    }

    await pf.createIndex(
      { 'property.location.full_name': 1, 'property.price.value': 1 },
      { name: 'idx_location_price' }
    );

    await pf.createIndex(
      { crawled_at: -1 },
      { name: 'idx_crawled_at_desc' }
    );
  },

  async down(db) {
    for (const name of COLLECTIONS) {
      await db.collection(name).dropIndex('idx_listing_id_unique').catch(() => {});
    }
    const pf = db.collection('propertyfinder_raw');
    await pf.dropIndex('idx_location_price').catch(() => {});
    await pf.dropIndex('idx_crawled_at_desc').catch(() => {});
  },
};
