const { Router } = require('express');
const db = require('../../lib/database');

const router = Router();

/**
 * GET /api/listings?page=1&limit=20&minPrice=&maxPrice=&bedrooms=&furnished=&search=
 */
router.get('/listings', async (req, res) => {
  try {
    const { page = 1, limit = 20, source = 'all', ...filters } = req.query;
    const result = await db.queryListings(
      source,
      filters,
      parseInt(page, 10),
      parseInt(limit, 10)
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats?source=pf
 */
router.get('/stats', async (req, res) => {
  try {
    const source = req.query.source || 'all';
    const stats = await db.getStats(source);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/bedrooms?source=pf
 */
router.get('/bedrooms', async (req, res) => {
  try {
    const source = req.query.source || 'all';
    const data = await db.getBedroomDistribution(source);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
