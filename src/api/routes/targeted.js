const { Router } = require('express');
const { MongoClient } = require('mongodb');
const config = require('../../config');
const { isAdmin } = require('../../lib/auth');

const router = Router();

let _db = null;

async function getDb() {
  if (_db) return _db;
  const client = new MongoClient(config.mongo.uri, { maxPoolSize: 5 });
  await client.connect();
  _db = client.db(config.mongo.dbName);
  return _db;
}

/**
 * GET /api/targeted-results?page=1&limit=20&sort=score&neighborhood=&minScore=
 */
router.get('/targeted-results', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const sort = req.query.sort || 'score';
    const neighborhood = req.query.neighborhood || '';
    const minScore = parseInt(req.query.minScore, 10) || 0;
    const source = req.query.source || '';

    // Breakdown filters
    const minVal = parseInt(req.query.minVal, 10) || 0;
    const minPark = parseInt(req.query.minPark, 10) || 0;
    const minUtil = parseInt(req.query.minUtil, 10) || 0;
    const minSize = parseInt(req.query.minSize, 10) || 0;
    const minFee = parseInt(req.query.minFee, 10) || 0;
    const minPay = parseInt(req.query.minPay, 10) || 0;
    const minVerified = parseInt(req.query.minVerified, 10) || 0;
    const minOven = parseInt(req.query.minOven, 10) || 0;
    const maxCommute = parseInt(req.query.maxCommute, 10) || 0;
    const interest = req.query.interest || ''; // 'interested' or 'ignored'

    const db = await getDb();
    const col = db.collection('targeted_results');

    // Build filter
    const filter = {};
    if (neighborhood) filter.neighborhood_en = neighborhood;
    if (minScore > 0) filter.score = { $gte: minScore };
    if (source) filter.source = source;
    if (interest) filter.interest = interest;

    // Boolean filters (parking/utilities/fees → has_* fields)
    if (minPark > 0) filter.has_parking = true;
    if (minUtil > 0) filter.has_utilities = true;
    if (minFee > 0) filter.has_no_commission = true;
    if (minOven > 0) filter.has_oven = true;
    // Score-based filters
    if (minVal > 0) filter['score_breakdown.effective_cost'] = { $gte: minVal };
    if (minSize > 0) filter['score_breakdown.size_bonus'] = { $gte: minSize };
    if (minPay > 0) filter['score_breakdown.payment'] = { $gte: minPay };
    if (minVerified > 0) filter['score_breakdown.verified'] = { $gte: minVerified };
    if (maxCommute > 0 && maxCommute < 90) filter.commute_min = { $lte: maxCommute };

    // Build sort
    const sortMap = {
      score: { score: -1 },
      cost: { effective_monthly_cost: 1 },
      commute: { commute_min: 1 },
      price: { price: 1 },
      price_desc: { price: -1 },
      size: { size_sqm: -1 },
      newest: { crawled_at: -1 },
    };
    const sortObj = sortMap[sort] || sortMap.score;

    const skip = (page - 1) * limit;
    const [docs, total, neighborhoods, statDocs] = await Promise.all([
      col.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
      col.distinct('neighborhood_en'),
      col.find(filter, { projection: { score: 1, effective_monthly_cost: 1, burden_index: 1 } }).toArray(),
    ]);

    function median(values) {
      if (!values.length) return 0;
      values.sort((a, b) => a - b);
      const mid = Math.floor(values.length / 2);
      return values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    }

    const scores = statDocs.map(d => d.score || 0);
    const costs = statDocs.map(d => d.effective_monthly_cost || 0);
    const burdens = statDocs.map(d => d.burden_index || 0);

    res.json({
      docs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      neighborhoods: neighborhoods.sort(),
      stats: {
        medianScore: Math.round(median(scores)),
        medianCost: Math.round(median(costs)),
        medianBurden: Math.round(median(burdens)),
        neighborhoodCount: neighborhoods.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/targeted-results/interact
 * Body: { listing_id, status }
 */
router.post('/targeted-results/interact', async (req, res) => {
  try {
    const { listing_id, status } = req.body;

    if (!isAdmin(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = await getDb();
    const col = db.collection('targeted_results');

    const result = await col.updateOne(
      { listing_id: String(listing_id) },
      { $set: { interest: status, interacted_at: new Date() } }
    );

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
