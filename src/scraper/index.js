const pLimit = require('p-limit').default;
const config = require('../config');
const logger = require('../lib/logger');
const db = require('../lib/database');
const { createHttpClient } = require('../lib/cookie-manager');
const { fetchPage, initBuildId } = require('./fetcher');
const { generateCombinations } = require('./search-combinations');
const CircuitBreaker = require('./circuit-breaker');

// ─── Graceful Shutdown ───────────────────────────────────────────────
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return; // Prevent double shutdown
  shuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received. Draining queue...');
  // Workers check `shuttingDown` flag before each page fetch.
  // After all workers exit naturally, the main() Promise.all resolves
  // and we close DB there.
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Single Search Combination Worker ────────────────────────────────

/**
 * Crawl all pages for one search filter combination.
 */
async function processSearchCombination(httpClient, combo, mode) {
  const { params, label } = combo;
  const isIncremental = mode === 'incremental';

  // Incremental mode: force sort by newest
  const queryParams = { ...params };
  if (isIncremental) {
    queryParams.ob = 'nd';
  }

  const breaker = isIncremental ? new CircuitBreaker() : null;

  let currentPage = 1;
  let totalPages = 1;
  let totalInserted = 0;
  let totalUpdated = 0;

  logger.info({ label, mode }, 'Starting search combination');

  while (currentPage <= totalPages) {
    // Check shutdown flag before each page
    if (shuttingDown) {
      logger.info({ label, currentPage }, 'Shutdown: stopping combination early');
      break;
    }

    const result = await fetchPage(httpClient, queryParams, currentPage);

    if (!result || result.listings.length === 0) {
      logger.debug({ label, currentPage }, 'No more listings');
      break;
    }

    totalPages = result.meta.pageCount;

    // Incremental: circuit breaker check
    if (isIncremental && breaker) {
      const ids = result.listings
        .filter((item) => item.listing_type === 'property' && item.property?.id)
        .map((item) => item.property.id);

      if (ids.length > 0) {
        const existingIds = await db.checkExistingIds('pf', ids);
        const shouldBreak = breaker.processBatch(ids, existingIds);

        if (shouldBreak) {
          logger.info(
            { label, currentPage, consecutiveExisting: breaker.consecutiveExisting },
            'Circuit breaker triggered — stopping pagination'
          );
          // Still save the current page before breaking
          await db.bulkUpsertListings('pf', result.listings);
          break;
        }
      }
    }

    // Save to MongoDB (bulkWrite with upsert)
    const stats = await db.bulkUpsertListings('pf', result.listings);
    totalInserted += stats.inserted;
    totalUpdated += stats.updated;

    logger.info(
      {
        label,
        page: `${currentPage}/${totalPages}`,
        listings: result.listings.length,
        inserted: stats.inserted,
        updated: stats.updated,
      },
      'Page processed'
    );

    currentPage++;
  }

  logger.info(
    { label, totalInserted, totalUpdated },
    'Search combination complete'
  );
}

// ─── Main Entry Point ────────────────────────────────────────────────

async function main() {
  const mode = config.scraper.mode;
  const concurrency = config.scraper.concurrency;

  logger.info({
    mode,
    concurrency,
    rateLimitRpm: config.scraper.rateLimitRpm,
    circuitBreakThreshold: config.scraper.circuitBreakThreshold,
  }, '=== UAE Property Scraper starting ===');

  // 1. Connect to MongoDB
  await db.connect();

  // 2. Create HTTP client with cookie jar
  const httpClient = createHttpClient();

  // 3. Pre-fetch Build ID
  const buildId = await initBuildId(httpClient);
  logger.info({ buildId }, 'Initial Build ID ready');

  // 4. Generate search combinations
  const combinations = generateCombinations();
  logger.info({ combinations: combinations.length }, 'Search combinations generated');

  // 5. Process with concurrency limiter
  const limit = pLimit(concurrency);

  const tasks = combinations.map((combo) =>
    limit(() => {
      if (shuttingDown) return Promise.resolve();
      return processSearchCombination(httpClient, combo, mode);
    })
  );

  await Promise.all(tasks);

  // 6. Summary
  const stats = await db.getStats('pf');
  logger.info(stats, '=== Scraping complete. Database summary ===');

  // 7. Clean shutdown
  await db.close();
  logger.info('Exiting normally.');
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Unhandled fatal error');
  db.close().finally(() => process.exit(1));
});
