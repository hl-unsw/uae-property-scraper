const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('../lib/logger');
const db = require('../lib/database');
const targetedRouter = require('./routes/targeted');
const exchangeRouter = require('./routes/exchange');
const crypto = require('crypto');

const app = express();

// Admin token: fixed via env var on Vercel, random per session locally
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(8).toString('hex');
app.locals.adminToken = ADMIN_TOKEN;

// Body parser for interactions
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Token validation
app.get('/api/auth/validate', (req, res) => {
  const token = req.query.token;
  res.json({ valid: !!(token && token === ADMIN_TOKEN) });
});

// API routes
app.use('/api', targetedRouter);
app.use('/api/exchange', exchangeRouter);

// SPA fallback
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/targeted.html'));
});

async function start() {
  await db.connect();

  app.listen(config.api.port, () => {
    logger.info({ port: config.api.port }, 'API server running');
    console.log('\n' + '═'.repeat(50));
    if (process.env.ADMIN_TOKEN) {
      console.log(`🔒 Using fixed ADMIN_TOKEN from environment`);
    } else {
      console.log(`🚀 Access with ADMIN privileges:`);
      console.log(`   http://localhost:${config.api.port}?token=${ADMIN_TOKEN}`);
    }
    console.log('═'.repeat(50) + '\n');
    logger.info(`Dashboard: http://localhost:${config.api.port}`);
  });
}

start().catch((err) => {
  logger.fatal({ err: err.message }, 'Failed to start API server');
  process.exit(1);
});
