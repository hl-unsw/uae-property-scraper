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

  // Create unique indexes on all collections
  for (const col of Object.values(COLLECTIONS)) {
    await db.collection(col).createIndex({ listing_id: 1 }, { unique: true });
  }
  // Compound index for querying by location + price
  await db.collection(COLLECTIONS.pf).createIndex({
    'property.location.full_name': 1,
    'property.price.value': 1,
  });
  // Index for incremental lookups
  await db.collection(COLLECTIONS.pf).createIndex({ crawled_at: -1 });

  logger.info('MongoDB connected & indexes ensured');
  return db;
}

/**
 * Bulk upsert listings into the appropriate collection.
 * Filters out non-property items (e.g. listing_type: "project").
 */
async function bulkUpsertListings(source, rawItems) {
  if (!rawItems || rawItems.length === 0) return { inserted: 0, updated: 0 };

  const collectionName = COLLECTIONS[source];
  if (!collectionName) throw new Error(`Unknown source: ${source}`);

  // Filter: only keep listing_type === 'property' with a valid id
  const valid = rawItems.filter(
    (item) => item.listing_type === 'property' && item.property?.id
  );

  if (valid.length === 0) return { inserted: 0, updated: 0 };

  const now = new Date();
  const bulkOps = valid.map((item) => ({
    updateOne: {
      filter: { listing_id: item.property.id },
      update: {
        $set: {
          ...item,
          listing_id: item.property.id,
          spider_source: source,
          crawled_at: now,
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
 */
async function queryListings(source, filters = {}, page = 1, limit = 20) {
  const collectionName = COLLECTIONS[source];
  const query = {};

  if (filters.minPrice) {
    query['property.price.value'] = { $gte: Number(filters.minPrice) };
  }
  if (filters.maxPrice) {
    query['property.price.value'] = {
      ...query['property.price.value'],
      $lte: Number(filters.maxPrice),
    };
  }
  if (filters.bedrooms) {
    query['property.bedrooms'] = String(filters.bedrooms);
  }
  if (filters.furnished) {
    query['property.furnished'] = filters.furnished;
  }
  if (filters.search) {
    query['property.title'] = { $regex: filters.search, $options: 'i' };
  }

  const skip = (page - 1) * limit;
  const collection = db.collection(collectionName);

  const [docs, total] = await Promise.all([
    collection
      .find(query)
      .sort({ crawled_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments(query),
  ]);

  return { docs, total, page, totalPages: Math.ceil(total / limit) };
}

/**
 * Get aggregation stats for dashboard.
 */
async function getStats(source) {
  const collectionName = COLLECTIONS[source];
  const collection = db.collection(collectionName);

  const [total, pipeline] = await Promise.all([
    collection.countDocuments(),
    collection
      .aggregate([
        {
          $group: {
            _id: null,
            avgPrice: { $avg: '$property.price.value' },
            minPrice: { $min: '$property.price.value' },
            maxPrice: { $max: '$property.price.value' },
            avgSize: { $avg: '$property.size.value' },
            lastCrawled: { $max: '$crawled_at' },
          },
        },
      ])
      .toArray(),
  ]);

  const agg = pipeline[0] || {};
  return {
    totalListings: total,
    avgPrice: Math.round(agg.avgPrice || 0),
    minPrice: agg.minPrice || 0,
    maxPrice: agg.maxPrice || 0,
    avgSize: Math.round(agg.avgSize || 0),
    lastCrawled: agg.lastCrawled || null,
  };
}

/**
 * Get bedroom distribution for charts.
 */
async function getBedroomDistribution(source) {
  const collectionName = COLLECTIONS[source];
  return db
    .collection(collectionName)
    .aggregate([
      { $group: { _id: '$property.bedrooms', count: { $sum: 1 } } },
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
