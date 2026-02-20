const express = require('express');
const { MongoClient } = require('mongodb');
const staticDb = require('../src/lib/static-db');
const axios = require('axios');

const app = express();

// Body parser for POST requests
app.use(express.json());

// Security: Restrict CORS to official domain in production
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://uae-property-scraper.vercel.app',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// ─── MongoDB (lazy, for interact endpoint) ────────────
let _db = null;
async function getDb() {
  if (_db) return _db;
  const uri = process.env.MONGO_URI;
  if (!uri) return null;
  const client = new MongoClient(uri, { maxPoolSize: 2 });
  await client.connect();
  _db = client.db(process.env.MONGO_DB_NAME || 'uae_real_estate');
  return _db;
}

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

// Token validation — frontend checks before showing admin UI
app.get('/api/auth/validate', (req, res) => {
  const token = req.query.token;
  const valid = !!(process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
  res.json({ valid });
});

// Listing interaction (requires MongoDB)
app.post('/api/targeted-results/interact', async (req, res) => {
  try {
    const { listing_id, status, token } = req.body;

    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = await getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }

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

// For Vercel, we export the app
module.exports = app;
