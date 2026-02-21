const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('../lib/logger');
const db = require('../lib/database');
const { mountAuthRoutes } = require('../lib/auth');
const targetedRouter = require('./routes/targeted');
const exchangeRouter = require('./routes/exchange');

const app = express();

// Body parser for interactions
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Auth + WebAuthn (shared module)
mountAuthRoutes(app);

// API routes
app.use('/api', targetedRouter);
app.use('/api/exchange', exchangeRouter);

// SPA fallback
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function start() {
  await db.connect();

  app.listen(config.api.port, () => {
    logger.info({ port: config.api.port }, 'API server running');
    console.log('\n' + '='.repeat(50));
    console.log(`  Dashboard: http://localhost:${config.api.port}`);
    console.log(`  Auth: Touch ID (WebAuthn)`);
    if (!process.env.HMAC_SECRET) {
      console.log('\n  WARNING: HMAC_SECRET not set — auth will fail');
    }
    if (!process.env.WEBAUTHN_CREDENTIAL_ID) {
      console.log('  No credential registered — click "Register" to set up');
    }
    console.log('='.repeat(50) + '\n');
  });
}

start().catch((err) => {
  logger.fatal({ err: err.message }, 'Failed to start API server');
  process.exit(1);
});
