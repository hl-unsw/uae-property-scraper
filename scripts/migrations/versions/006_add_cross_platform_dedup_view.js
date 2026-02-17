/**
 * Migration 006: Create cross-platform deduplication view
 *
 * Creates a MongoDB view `listings_unified` that merges all three
 * source collections into a single queryable view with a normalized
 * schema. This is for future cross-platform dedup and comparison.
 *
 * The view uses $unionWith to combine collections without duplicating
 * physical storage.
 */

module.exports = {
  description: 'Create listings_unified view for cross-platform queries',

  async up(db) {
    // Drop if exists (views can't be updated, only replaced)
    await db.collection('listings_unified').drop().catch(() => {});

    await db.createCollection('listings_unified', {
      viewOn: 'propertyfinder_raw',
      pipeline: [
        // Normalize PF documents
        {
          $project: {
            _id: 1,
            source: { $literal: 'propertyfinder' },
            listing_id: 1,
            title: '$property.title',
            price_value: '$property.price.value',
            price_currency: '$property.price.currency',
            price_period: '$property.price.period',
            bedrooms: '$property.bedrooms',
            bathrooms: '$property.bathrooms',
            size_sqft: '$property.size.value',
            furnished: '$property.furnished',
            location: '$property.location.full_name',
            lat: '$property.location.coordinates.lat',
            lon: '$property.location.coordinates.lon',
            amenities: '$property.amenity_names',
            agent_name: '$property.agent.name',
            broker_name: '$property.broker.name',
            url: '$property.share_url',
            listed_date: '$property.listed_date',
            crawled_at: 1,
          },
        },
        // Union with Dubizzle (normalize when data exists)
        {
          $unionWith: {
            coll: 'dubizzle_raw',
            pipeline: [
              {
                $project: {
                  _id: 1,
                  source: { $literal: 'dubizzle' },
                  listing_id: 1,
                  title: '$title',
                  price_value: '$price',
                  price_currency: { $literal: 'AED' },
                  price_period: '$rent_frequency',
                  bedrooms: '$bedrooms',
                  bathrooms: '$bathrooms',
                  size_sqft: '$size',
                  furnished: '$furnished',
                  location: '$location',
                  lat: '$latitude',
                  lon: '$longitude',
                  amenities: '$amenities',
                  agent_name: '$agent_name',
                  broker_name: '$broker_name',
                  url: '$url',
                  listed_date: '$posted_date',
                  crawled_at: 1,
                },
              },
            ],
          },
        },
        // Union with Bayut
        {
          $unionWith: {
            coll: 'bayut_raw',
            pipeline: [
              {
                $project: {
                  _id: 1,
                  source: { $literal: 'bayut' },
                  listing_id: 1,
                  title: '$title',
                  price_value: '$price',
                  price_currency: { $literal: 'AED' },
                  price_period: '$rentFrequency',
                  bedrooms: '$rooms',
                  bathrooms: '$baths',
                  size_sqft: '$area',
                  furnished: '$furnishingStatus',
                  location: '$location.name',
                  lat: '$geography.lat',
                  lon: '$geography.lng',
                  amenities: '$amenities',
                  agent_name: '$contactName',
                  broker_name: '$agency.name',
                  url: '$externalURL',
                  listed_date: '$createdAt',
                  crawled_at: 1,
                },
              },
            ],
          },
        },
      ],
    });
  },

  async down(db) {
    await db.collection('listings_unified').drop().catch(() => {});
  },
};
