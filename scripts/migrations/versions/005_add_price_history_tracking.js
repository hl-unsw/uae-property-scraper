/**
 * Migration 005: Add price history tracking
 *
 * Adds a `price_history` array field to each listing. When the scraper
 * detects a price change on re-crawl, it should push the old price
 * to this array. This migration initializes the field with the current
 * price as the first history entry for all existing documents.
 *
 * Schema:
 *   price_history: [
 *     { value: 65000, currency: "AED", period: "yearly", recorded_at: ISODate }
 *   ]
 */

module.exports = {
  description: 'Initialize price_history array for price change tracking',

  async up(db) {
    const pf = db.collection('propertyfinder_raw');

    // Add price_history with current price as first entry
    const result = await pf.updateMany(
      {
        'property.price.value': { $exists: true },
        price_history: { $exists: false },
      },
      [
        {
          $set: {
            price_history: [
              {
                value: '$property.price.value',
                currency: '$property.price.currency',
                period: '$property.price.period',
                recorded_at: '$crawled_at',
              },
            ],
          },
        },
      ]
    );

    console.log(`    Initialized price_history on ${result.modifiedCount} documents`);

    // Index for finding listings with price changes
    await pf.createIndex(
      { 'price_history.1': 1 },
      { name: 'idx_has_price_change', sparse: true }
    );
  },

  async down(db) {
    const pf = db.collection('propertyfinder_raw');
    await pf.dropIndex('idx_has_price_change').catch(() => {});
    await pf.updateMany(
      { price_history: { $exists: true } },
      { $unset: { price_history: '' } }
    );
  },
};
