require('dotenv').config();

module.exports = {
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017',
    dbName: process.env.MONGO_DB_NAME || 'uae_real_estate',
  },
  scraper: {
    mode: process.env.MODE || 'incremental',
    rateLimitRpm: parseInt(process.env.RATE_LIMIT_RPM, 10) || 8,
    concurrency: parseInt(process.env.CONCURRENCY, 10) || 2,
    circuitBreakThreshold: parseInt(process.env.CIRCUIT_BREAK_THRESHOLD, 10) || 50,
    maxRetries: 3,
    // Property Finder search page (MUST use /en/search, NOT homepage)
    searchPageUrl: 'https://www.propertyfinder.ae/en/search',
    // API base — {BUILD_ID} is a placeholder
    apiBase: 'https://www.propertyfinder.ae/search/_next/data/{BUILD_ID}/en/search.json',
  },
  dubizzle: {
    pageDelayMs: parseInt(process.env.DUBIZZLE_PAGE_DELAY_MS, 10) || 1000,
    circuitBreakThreshold: parseInt(process.env.DUBIZZLE_CIRCUIT_BREAK_THRESHOLD, 10) || 50,
    mode: process.env.DUBIZZLE_MODE || 'incremental',
  },
  bayut: {
    seedUrl: process.env.BAYUT_SEED_URL || 'https://www.bayut.com/to-rent/apartments/abu-dhabi/',
    headless: process.env.BAYUT_HEADLESS !== 'false',
    pageDelayMs: parseInt(process.env.BAYUT_PAGE_DELAY_MS, 10) || 5000,
    maxReChallenge: parseInt(process.env.BAYUT_MAX_RECHALLENGE, 10) || 3,
    circuitBreakThreshold: parseInt(process.env.BAYUT_CIRCUIT_BREAK_THRESHOLD, 10) || 50,
    mode: process.env.BAYUT_MODE || 'incremental',
  },
  api: {
    port: parseInt(process.env.API_PORT, 10) || 3000,
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
