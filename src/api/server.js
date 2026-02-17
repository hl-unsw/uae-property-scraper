const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('../lib/logger');
const db = require('../lib/database');
const listingsRouter = require('./routes/listings');

const app = express();

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api', listingsRouter);

// SPA fallback
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function start() {
  await db.connect();

  app.listen(config.api.port, () => {
    logger.info({ port: config.api.port }, 'API server running');
    logger.info(`Dashboard: http://localhost:${config.api.port}`);
  });
}

start().catch((err) => {
  logger.fatal({ err: err.message }, 'Failed to start API server');
  process.exit(1);
});
