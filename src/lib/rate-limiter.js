const { RateLimit } = require('async-sema');
const config = require('../config');

/**
 * Token-bucket rate limiter with UNIFORM distribution.
 *
 * uniformDistribution: true  → spreads requests evenly across the time window.
 * Without it, tokens are released in bursts (all at once), which is terrible
 * for anti-bot evasion.
 *
 * Example: RPM=8 → one request allowed every ~7.5 seconds.
 */
const rateLimiter = RateLimit(config.scraper.rateLimitRpm, {
  timeUnit: 60_000,
  uniformDistribution: true,
});

/**
 * Random jitter delay (500ms–2000ms) applied AFTER acquiring the token.
 * Prevents predictable timing patterns.
 */
function jitter() {
  const ms = 500 + Math.random() * 1500;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquire a rate-limit token, then apply jitter.
 * Call this before every outgoing HTTP request.
 */
async function acquire() {
  await rateLimiter();
  await jitter();
}

module.exports = { acquire };
