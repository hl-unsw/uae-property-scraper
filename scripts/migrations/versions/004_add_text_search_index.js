/**
 * Migration 004: Add text search index
 *
 * Replaces regex-based title search with a MongoDB text index.
 * Covers title, location name, and amenity names for full-text queries.
 *
 * After this migration, you can query:
 *   db.propertyfinder_raw.find({ $text: { $search: "furnished corniche sea view" } })
 */

module.exports = {
  description: 'Add text index on title, location, and amenity names',

  async up(db) {
    const pf = db.collection('propertyfinder_raw');

    await pf.createIndex(
      {
        'property.title': 'text',
        'property.location.full_name': 'text',
        'property.amenity_names': 'text',
      },
      {
        name: 'idx_text_search',
        weights: {
          'property.title': 10,
          'property.location.full_name': 5,
          'property.amenity_names': 2,
        },
        default_language: 'english',
      }
    );
  },

  async down(db) {
    const pf = db.collection('propertyfinder_raw');
    await pf.dropIndex('idx_text_search').catch(() => {});
  },
};
