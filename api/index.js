const express = require('express');
const staticDb = require('../src/lib/static-db');
const axios = require('axios');

const app = express();

// Middleware to handle CORS if needed (Vercel handles this mostly, but good for local)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
});

// Targeted Results API
app.get('/api/targeted-results', (req, res) => {
  try {
    const result = staticDb.queryTargeted(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exchange Rate API (Live from Wise)
let rateCache = { rate: 1.97, last: 0 };

app.get('/api/exchange/rate', async (req, res) => {
  const now = Date.now();
  if (now - rateCache.last < 3600000) {
    return res.json({ rate: rateCache.rate });
  }

  try {
    const response = await axios.get('https://wise.com/rates/live?source=AED&target=CNY', {
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://wise.com/'
      },
      timeout: 5000
    });
    if (response.data && response.data.value) {
      rateCache.rate = response.data.value;
      rateCache.last = now;
    }
  } catch (err) {
    console.error('Exchange rate fetch failed, using fallback');
  }
  res.json({ rate: rateCache.rate });
});

// For Vercel, we export the app
module.exports = app;
