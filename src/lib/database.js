const { MongoClient } = require('mongodb');
const config = require('../config');
const logger = require('./logger');

let client = null;
let db = null;

const COLLECTIONS = {
  pf: 'propertyfinder_raw',
  dubizzle: 'dubizzle_raw',
  bayut: 'bayut_raw',
};

/**
 * Connect to MongoDB and ensure indexes exist.
 */
async function connect() {
  if (db) return db;

  client = new MongoClient(config.mongo.uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  await client.connect();
  db = client.db(config.mongo.dbName);

  // Ensure indexes exist (use named indexes to avoid conflicts with migrations)
  for (const col of Object.values(COLLECTIONS)) {
    await db.collection(col).createIndex(
      { listing_id: 1 },
      { unique: true, name: 'idx_listing_id_unique' }
    );
  }
  await db.collection(COLLECTIONS.pf).createIndex(
    { 'property.location.full_name': 1, 'property.price.value': 1 },
    { name: 'idx_location_price' }
  );
  await db.collection(COLLECTIONS.pf).createIndex(
    { crawled_at: -1 },
    { name: 'idx_crawled_at_desc' }
  );

  logger.info('MongoDB connected & indexes ensured');
  return db;
}

/**
 * Per-source field path mappings for querying and normalization.
 */
const FIELD_PATHS = {
  pf: {
    price: 'property.price.value',
    size: 'property.size.value',
    bedrooms: 'property.bedrooms',
    title: 'property.title',
    furnished: 'property.furnished',
    location: 'property.location.full_name',
  },
  bayut: {
    price: 'price',
    size: 'area',
    bedrooms: 'rooms',
    title: 'title',
    furnished: 'furnishingStatus',
    location: null, // complex array — handled in normalizeListing
  },
  dubizzle: {
    price: 'price',
    size: 'size',
    bedrooms: 'bedrooms',
    title: 'name.en',
    furnished: 'furnished',
    location: null, // complex nested — handled in normalizeListing
  },
};

/**
 * Resolve a dot-path on an object (e.g. 'property.price.value').
 */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * Convert any source's raw document into a common shape for the frontend.
 */
function normalizeListing(source, doc) {
  const fp = FIELD_PATHS[source];

  // Title
  const title = getPath(doc, fp.title) || 'Untitled';

  // Price & size
  const price = Number(getPath(doc, fp.price)) || 0;
  const sizeSqft = Number(getPath(doc, fp.size)) || 0;
  const size = Math.round(sizeSqft * 0.092903);

  // Bedrooms (number or string → always string)
  const rawBeds = getPath(doc, fp.bedrooms);
  const bedrooms = String(rawBeds ?? '');

  // Furnished (PF: "YES"/"NO"/"PARTLY", Bayut: "furnished"/"unfurnished"/null, Dubizzle: boolean)
  let furnished = getPath(doc, fp.furnished);
  if (typeof furnished === 'boolean') furnished = furnished ? 'YES' : 'NO';
  furnished = furnished || '';

  // Location
  let location = '';
  if (source === 'bayut' && Array.isArray(doc.location)) {
    location = doc.location.filter(l => l.level >= 2).map(l => l.name).join(', ');
  } else if (source === 'dubizzle') {
    const parts = [];
    if (doc.building?.name?.en) parts.push(doc.building.name.en);
    const hoods = doc.neighborhoods?.name?.en;
    if (Array.isArray(hoods)) parts.push(...hoods);
    else if (hoods) parts.push(hoods);
    if (doc.city?.name?.en) parts.push(doc.city.name.en);
    location = parts.join(', ');
  } else {
    location = fp.location ? (getPath(doc, fp.location) || '') : '';
  }

  // URL
  let url;
  if (source === 'pf') {
    url = doc.property?.share_url || '#';
  } else if (source === 'bayut') {
    url = doc.slug ? `https://www.bayut.com/property/details-${doc.id}.html` : '#';
  } else if (source === 'dubizzle') {
    url = doc.absolute_url?.en || doc.short_url || '#';
  } else {
    url = '#';
  }

  return {
    _id: doc._id,
    listing_id: doc.listing_id,
    source: doc.spider_source || source,
    title, price, size, bedrooms, furnished, location, url,
    crawled_at: doc.crawled_at,
  };
}

/**
 * Build a MongoDB query using the correct field paths for the given source.
 */
function buildSourceQuery(source, filters) {
  const fp = FIELD_PATHS[source];
  const query = {};
  if (filters.minPrice) query[fp.price] = { $gte: Number(filters.minPrice) };
  if (filters.maxPrice) query[fp.price] = { ...query[fp.price], $lte: Number(filters.maxPrice) };
  if (filters.bedrooms) {
    if (source === 'pf') {
      // PF stores bedrooms as string; studios are "studio" not "0"
      query[fp.bedrooms] = filters.bedrooms === '0' ? 'studio' : String(filters.bedrooms);
    } else {
      query[fp.bedrooms] = Number(filters.bedrooms);
    }
  }
  if (filters.furnished) {
    if (source === 'dubizzle') {
      query[fp.furnished] = filters.furnished === 'YES';
    } else {
      query[fp.furnished] = filters.furnished;
    }
  }
  if (filters.search) query[fp.title] = { $regex: filters.search, $options: 'i' };
  return query;
}

/**
 * Source-specific adapters for validating and transforming raw items.
 * Each adapter defines how to filter valid items and extract listing_id.
 */
const SOURCE_ADAPTERS = {
  pf: {
    filter: (item) => item.listing_type === 'property' && item.property?.id,
    getId: (item) => item.property.id,
  },
  bayut: {
    filter: (item) => item.id && item.purpose,
    getId: (item) => String(item.id),
  },
  dubizzle: {
    filter: (item) => item.id && item.price !== undefined,
    getId: (item) => String(item.id),
  },
};

/**
 * Bulk upsert listings into the appropriate collection.
 * Uses SOURCE_ADAPTERS to handle source-specific filtering and ID extraction.
 */
async function bulkUpsertListings(source, rawItems) {
  if (!rawItems || rawItems.length === 0) return { inserted: 0, updated: 0 };

  const collectionName = COLLECTIONS[source];
  if (!collectionName) throw new Error(`Unknown source: ${source}`);

  const adapter = SOURCE_ADAPTERS[source];
  if (!adapter) throw new Error(`No adapter for source: ${source}`);

  const valid = rawItems.filter(adapter.filter);

  if (valid.length === 0) return { inserted: 0, updated: 0 };

  const now = new Date();
  const bulkOps = valid.map((item) => ({
    updateOne: {
      filter: { listing_id: adapter.getId(item) },
      update: {
        $set: {
          ...item,
          listing_id: adapter.getId(item),
          spider_source: source,
          crawled_at: now,
        },
        $setOnInsert: {
          first_seen_at: now,
        },
      },
      upsert: true,
    },
  }));

  const collection = db.collection(collectionName);

  try {
    // ordered: false — partial failures don't block the batch
    const result = await collection.bulkWrite(bulkOps, { ordered: false });
    const stats = {
      inserted: result.upsertedCount || 0,
      updated: result.modifiedCount || 0,
    };
    logger.info({ collection: collectionName, ...stats }, 'Bulk upsert done');
    return stats;
  } catch (error) {
    // MongoBulkWriteError: some ops may have succeeded
    if (error.result) {
      const partial = {
        inserted: error.result.nUpserted || 0,
        updated: error.result.nModified || 0,
        errors: error.result.getWriteErrors?.()?.length || 0,
      };
      logger.warn(partial, 'Partial bulk write — some ops failed');
      return partial;
    }
    logger.error({ err: error.message }, 'BulkWrite fatal error');
    throw error;
  }
}

/**
 * Check which listing IDs already exist in the database.
 * Returns a Set of existing IDs.
 */
async function checkExistingIds(source, ids) {
  const collectionName = COLLECTIONS[source];
  const docs = await db
    .collection(collectionName)
    .find({ listing_id: { $in: ids } }, { projection: { listing_id: 1 } })
    .toArray();
  return new Set(docs.map((d) => d.listing_id));
}

/**
 * Query listings for the API/frontend.
 * When source === 'all', queries all 3 collections in parallel and merges results.
 */
async function queryListings(source, filters = {}, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  if (source !== 'all') {
    const query = buildSourceQuery(source, filters);
    const col = db.collection(COLLECTIONS[source]);
    const [docs, total] = await Promise.all([
      col.find(query).sort({ crawled_at: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments(query),
    ]);
    return {
      docs: docs.map(d => normalizeListing(source, d)),
      total, page, totalPages: Math.ceil(total / limit),
    };
  }

  // Multi-source: query all 3 in parallel
  const sources = Object.keys(COLLECTIONS);
  const results = await Promise.all(
    sources.map(async (s) => {
      const query = buildSourceQuery(s, filters);
      const col = db.collection(COLLECTIONS[s]);
      const docs = await col.find(query).sort({ crawled_at: -1 }).toArray();
      return docs.map(d => normalizeListing(s, d));
    })
  );

  const all = results.flat().sort((a, b) => new Date(b.crawled_at) - new Date(a.crawled_at));
  const total = all.length;
  const paged = all.slice(skip, skip + limit);
  return { docs: paged, total, page, totalPages: Math.ceil(total / limit) };
}

/**
 * Get aggregation stats for dashboard.
 */
const STATS_FIELDS = {
  pf: { price: '$property.price.value', size: '$property.size.value' },
  bayut: { price: '$price', size: '$area' },
  dubizzle: { price: '$price', size: '$size' },
};

async function getStats(source) {
  if (source === 'all') {
    const sources = Object.keys(COLLECTIONS);
    const perSource = await Promise.all(sources.map(s => getStats(s)));
    const totalListings = perSource.reduce((sum, s) => sum + s.totalListings, 0);
    if (totalListings === 0) {
      return { totalListings: 0, avgPrice: 0, minPrice: 0, maxPrice: 0, avgSize: 0, lastCrawled: null, medianPrice: 0, priceP25: 0, priceP75: 0, medianPricePerSqm: 0, medianDaysOnMarket: 0 };
    }
    const validPrices = perSource.filter(s => s.totalListings > 0);
    const weightedAvg = (field) => Math.round(validPrices.reduce((s, p) => s + p[field] * p.totalListings, 0) / totalListings) || 0;
    return {
      totalListings,
      avgPrice: weightedAvg('avgPrice'),
      minPrice: Math.min(...validPrices.map(s => s.minPrice).filter(p => p > 0)) || 0,
      maxPrice: Math.max(...validPrices.map(s => s.maxPrice)) || 0,
      avgSize: weightedAvg('avgSize'),
      lastCrawled: new Date(Math.max(...perSource.map(s => new Date(s.lastCrawled || 0)))),
      medianPrice: weightedAvg('medianPrice'),
      priceP25: Math.min(...validPrices.map(s => s.priceP25).filter(p => p > 0)) || 0,
      priceP75: Math.max(...validPrices.map(s => s.priceP75)) || 0,
      medianPricePerSqm: weightedAvg('medianPricePerSqm'),
      medianDaysOnMarket: weightedAvg('medianDaysOnMarket'),
    };
  }

  const collectionName = COLLECTIONS[source];
  const collection = db.collection(collectionName);
  
  // Define field mappings per source
  const mappings = {
    pf: {
      price: '$property.price.value',
      size: '$property.size.value',
      date: '$property.listed_date'
    },
    bayut: {
      price: '$price',
      size: '$area',
      date: '$first_seen_at'
    },
    dubizzle: {
      price: '$price',
      size: '$size',
      date: '$crawled_at'
    }
  };

  const fields = mappings[source] || mappings.pf;
  const SQFT_TO_SQM = 0.092903;

  const [total, pipeline] = await Promise.all([
    collection.countDocuments(),
    collection.aggregate([
      {
        $addFields: {
          // Normalize fields for calculation
          _calc_price: fields.price,
          _calc_size: { $multiply: [fields.size, SQFT_TO_SQM] }, // Convert to SQM
          _calc_date: { 
            $ifNull: [ 
              { $toDate: fields.date }, 
              '$first_seen_at', 
              '$crawled_at' 
            ] 
          }
        }
      },
      {
        $addFields: {
          // Calculate derived metrics
          _calc_price_sqm: {
            $cond: [
              { $gt: ['$_calc_size', 0] },
              { $divide: ['$_calc_price', '$_calc_size'] },
              null
            ]
          },
          _calc_dom_days: {
            $dateDiff: {
              startDate: '$_calc_date',
              endDate: '$$NOW',
              unit: 'day'
            }
          }
        }
      },
      {
        $facet: {
          // General Stats
          general: [
            {
              $group: {
                _id: null,
                avgPrice: { $avg: '$_calc_price' },
                minPrice: { $min: '$_calc_price' },
                maxPrice: { $max: '$_calc_price' },
                avgSize: { $avg: '$_calc_size' },
                lastCrawled: { $max: '$crawled_at' }
              }
            }
          ],
          // Price Percentiles (P25, Median, P75)
          pricePercentiles: [
             {
               $group: {
                 _id: null,
                 values: {
                   $percentile: {
                     input: '$_calc_price',
                     p: [0.25, 0.5, 0.75],
                     method: 'approximate'
                   }
                 }
               }
             }
          ],
          // Price per Sqm Median
          sqmPercentiles: [
            { $match: { _calc_price_sqm: { $ne: null } } },
            {
              $group: {
                _id: null,
                values: {
                  $percentile: {
                    input: '$_calc_price_sqm',
                    p: [0.5],
                    method: 'approximate'
                  }
                }
              }
            }
          ],
          // Days on Market Median
          domPercentiles: [
            {
              $group: {
                _id: null,
                values: {
                  $percentile: {
                    input: '$_calc_dom_days',
                    p: [0.5],
                    method: 'approximate'
                  }
                }
              }
            }
          ]
        }
      }
    ]).toArray()
  ]);

  const result = pipeline[0] || {};
  const general = result.general?.[0] || {};
  const priceP = result.pricePercentiles?.[0]?.values || [0, 0, 0];
  const sqmP = result.sqmPercentiles?.[0]?.values || [0];
  const domP = result.domPercentiles?.[0]?.values || [0];

  return {
    totalListings: total,
    // General
    avgPrice: Math.round(general.avgPrice || 0),
    minPrice: general.minPrice || 0,
    maxPrice: general.maxPrice || 0,
    avgSize: Math.round(general.avgSize || 0),
    lastCrawled: general.lastCrawled || null,
    // New Advanced Stats
    medianPrice: Math.round(priceP[1] || 0),      // P50
    priceP25: Math.round(priceP[0] || 0),         // P25 (Lower Quartile)
    priceP75: Math.round(priceP[2] || 0),         // P75 (Upper Quartile)
    medianPricePerSqm: Math.round(sqmP[0] || 0),  // P50 Sqm Price
    medianDaysOnMarket: Math.round(domP[0] || 0)   // Median Days on Market
  };
}

/**
 * Get bedroom distribution for charts.
 */
async function getBedroomDistribution(source) {
  if (source === 'all') {
    const sources = Object.keys(COLLECTIONS);
    const perSource = await Promise.all(sources.map(s => getBedroomDistribution(s)));
    const merged = {};
    for (const results of perSource) {
      for (const { _id, count } of results) {
        // Normalize "studio" → "0" for consistent grouping
        const key = String(_id).toLowerCase() === 'studio' ? '0' : String(_id);
        merged[key] = (merged[key] || 0) + count;
      }
    }
    return Object.entries(merged)
      .map(([_id, count]) => ({ _id, count }))
      .sort((a, b) => String(a._id).localeCompare(String(b._id), undefined, { numeric: true }));
  }

  const collectionName = COLLECTIONS[source];
  const bedroomField = '$' + FIELD_PATHS[source].bedrooms;
  return db
    .collection(collectionName)
    .aggregate([
      { $group: { _id: bedroomField, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
}

/**
 * Gracefully close the connection.
 */
async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed');
  }
}

module.exports = {
  connect,
  close,
  bulkUpsertListings,
  checkExistingIds,
  queryListings,
  getStats,
  getBedroomDistribution,
  COLLECTIONS,
};
