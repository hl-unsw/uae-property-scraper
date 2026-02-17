/**
 * Migration 002: Add bedroom and furnishing indexes
 *
 * These indexes support the dashboard filter queries on bedrooms
 * and furnished status, which are the two most common user filters.
 */

module.exports = {
  description: 'Add indexes for bedroom and furnishing filters',

  async up(db) {
    const pf = db.collection('propertyfinder_raw');

    await pf.createIndex(
      { 'property.bedrooms': 1 },
      { name: 'idx_bedrooms' }
    );

    await pf.createIndex(
      { 'property.furnished': 1 },
      { name: 'idx_furnished' }
    );

    // Compound: bedrooms + price (common combo query)
    await pf.createIndex(
      { 'property.bedrooms': 1, 'property.price.value': 1 },
      { name: 'idx_bedrooms_price' }
    );
  },

  async down(db) {
    const pf = db.collection('propertyfinder_raw');
    await pf.dropIndex('idx_bedrooms').catch(() => {});
    await pf.dropIndex('idx_furnished').catch(() => {});
    await pf.dropIndex('idx_bedrooms_price').catch(() => {});
  },
};
