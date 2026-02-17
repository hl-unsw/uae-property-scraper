/**
 * Migration 003: Add 2dsphere geospatial index
 *
 * Enables MongoDB geospatial queries ($near, $geoWithin) on listing
 * coordinates. Requires transforming the stored coordinate format
 * into a GeoJSON Point for each document.
 *
 * After this migration, you can query:
 *   db.propertyfinder_raw.find({
 *     geo: { $near: { $geometry: { type: "Point", coordinates: [54.4, 24.5] }, $maxDistance: 5000 } }
 *   })
 */

module.exports = {
  description: 'Add GeoJSON geo field and 2dsphere index for proximity queries',

  async up(db) {
    const pf = db.collection('propertyfinder_raw');

    // Transform existing coordinates into GeoJSON format
    // property.location.coordinates: { lat: 24.xx, lon: 54.xx }
    // → geo: { type: "Point", coordinates: [lon, lat] }  (GeoJSON is [lon, lat])
    const result = await pf.updateMany(
      {
        'property.location.coordinates.lat': { $exists: true },
        'property.location.coordinates.lon': { $exists: true },
        geo: { $exists: false },
      },
      [
        {
          $set: {
            geo: {
              type: 'Point',
              coordinates: [
                '$property.location.coordinates.lon',
                '$property.location.coordinates.lat',
              ],
            },
          },
        },
      ]
    );

    console.log(`    Transformed ${result.modifiedCount} documents to GeoJSON`);

    // Create 2dsphere index
    await pf.createIndex(
      { geo: '2dsphere' },
      { name: 'idx_geo_2dsphere', sparse: true }
    );
  },

  async down(db) {
    const pf = db.collection('propertyfinder_raw');
    await pf.dropIndex('idx_geo_2dsphere').catch(() => {});
    await pf.updateMany({ geo: { $exists: true } }, { $unset: { geo: '' } });
  },
};
