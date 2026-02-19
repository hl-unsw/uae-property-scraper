const { Router } = require('express');
const axios = require('axios');
const logger = require('../../lib/logger');

const router = Router();

let cache = {
  rate: 1.97, 
  lastUpdated: 0
};

/**
 * GET /api/exchange/rate
 */
router.get('/rate', async (req, res) => {
  const now = Date.now();
  if (now - cache.lastUpdated < 3600000 && cache.rate > 1) {
    return res.json({ rate: cache.rate });
  }

  try {
    // Fetch AED to CNY rate from Wise
    const response = await axios.get('https://wise.com/rates/live?source=AED&target=CNY', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://wise.com/gb/currency-converter/aed-to-cny-rate'
      }
    });
    if (response.data && response.data.value) {
      cache.rate = response.data.value;
      cache.lastUpdated = now;
      logger.info({ rate: cache.rate }, 'Exchange rate updated from Wise');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to fetch rate from Wise, using fallback');
  }
  res.json({ rate: cache.rate });
});

module.exports = router;
