const express = require('express');
const staticDb = require('../src/lib/static-db');
const axios = require('axios');

const app = express();

// Security: Restrict CORS to official domain in production
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://uae-property-scraper.vercel.app',
    'http://localhost:3000' // Keep for local development
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
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
