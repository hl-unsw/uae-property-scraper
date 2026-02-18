/**
 * Migration 008: Add Dubizzle-specific indexes
 *
 * Adds indexes to dubizzle_raw for common query patterns:
 * price, city+category, crawled_at, bedrooms, neighborhoods.
 */

const COLLECTION = 'dubizzle_raw';

module.exports = {
  description: 'Add dubizzle_raw indexes (price, city+category, crawled_at, bedrooms, neighborhoods)',

  async up(db) {
    const col = db.collection(COLLECTION);

    await col.createIndex(
      { price: 1 },
      { name: 'idx_dubizzle_price' },
    );

    await col.createIndex(
      { 'city.id': 1, 'categories.ids': 1 },
      { name: 'idx_dubizzle_city_category' },
    );

    await col.createIndex(
      { crawled_at: -1 },
      { name: 'idx_dubizzle_crawled_at_desc' },
    );

    await col.createIndex(
      { bedrooms: 1 },
      { name: 'idx_dubizzle_bedrooms' },
    );

    await col.createIndex(
      { 'neighborhoods.ids': 1 },
      { name: 'idx_dubizzle_neighborhoods' },
    );
  },

  async down(db) {
    const col = db.collection(COLLECTION);
    await col.dropIndex('idx_dubizzle_price').catch(() => {});
    await col.dropIndex('idx_dubizzle_city_category').catch(() => {});
    await col.dropIndex('idx_dubizzle_crawled_at_desc').catch(() => {});
    await col.dropIndex('idx_dubizzle_bedrooms').catch(() => {});
    await col.dropIndex('idx_dubizzle_neighborhoods').catch(() => {});
  },
};
