/**
 * Migration 007: Add Bayut-specific indexes
 *
 * Adds indexes to bayut_raw for common query patterns:
 * price+purpose, location name, crawled_at, rooms.
 */

const COLLECTION = 'bayut_raw';

module.exports = {
  description: 'Add bayut_raw indexes (price+purpose, location, crawled_at, rooms)',

  async up(db) {
    const col = db.collection(COLLECTION);

    await col.createIndex(
      { price: 1, purpose: 1 },
      { name: 'idx_bayut_price_purpose' }
    );

    await col.createIndex(
      { 'location.name': 1 },
      { name: 'idx_bayut_location_name' }
    );

    await col.createIndex(
      { crawled_at: -1 },
      { name: 'idx_bayut_crawled_at_desc' }
    );

    await col.createIndex(
      { rooms: 1 },
      { name: 'idx_bayut_rooms' }
    );
  },

  async down(db) {
    const col = db.collection(COLLECTION);
    await col.dropIndex('idx_bayut_price_purpose').catch(() => {});
    await col.dropIndex('idx_bayut_location_name').catch(() => {});
    await col.dropIndex('idx_bayut_crawled_at_desc').catch(() => {});
    await col.dropIndex('idx_bayut_rooms').catch(() => {});
  },
};
