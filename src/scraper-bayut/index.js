const config = require('../config');
const logger = require('../lib/logger');
const db = require('../lib/database');
const BayutBrowserSession = require('./browser-session');
const { fetchBayutPage } = require('./fetcher');
const { generateCombinations } = require('./search-combinations');
const CircuitBreaker = require('../scraper/circuit-breaker');

// ─── Graceful Shutdown ───────────────────────────────────────────────
let shuttingDown = false;
let session = null;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received. Cleaning up...');
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Process One Search Combination ─────────────────────────────────

async function processSearchCombination(browserSession, combo, mode) {
  const { label } = combo;
  const isIncremental = mode === 'incremental';
  const breaker = isIncremental
    ? new CircuitBreaker(config.bayut.circuitBreakThreshold)
    : null;

  let currentPage = 1;
  let totalPages = 1;
  let totalInserted = 0;
  let totalUpdated = 0;

  logger.info({ label, mode }, 'Starting Bayut search combination');

  while (currentPage <= totalPages) {
    if (shuttingDown) {
      logger.info({ label, currentPage }, 'Shutdown: stopping combination early');
      break;
    }

    const result = await fetchBayutPage(browserSession, combo, currentPage);

    if (!result || result.hits.length === 0) {
      logger.debug({ label, currentPage }, 'No more hits');
      break;
    }

    totalPages = result.nbPages;

    // Incremental: circuit breaker check
    if (isIncremental && breaker) {
      const ids = result.hits
        .filter((item) => item.id && item.purpose)
        .map((item) => String(item.id));

      if (ids.length > 0) {
        const existingIds = await db.checkExistingIds('bayut', ids);
        const shouldBreak = breaker.processBatch(ids, existingIds);

        if (shouldBreak) {
          logger.info(
            { label, currentPage, consecutiveExisting: breaker.consecutiveExisting },
            'Circuit breaker triggered — stopping pagination'
          );
          await db.bulkUpsertListings('bayut', result.hits);
          break;
        }
      }
    }

    // Save to MongoDB
    const stats = await db.bulkUpsertListings('bayut', result.hits);
    totalInserted += stats.inserted;
    totalUpdated += stats.updated;

    logger.info(
      {
        label,
        page: `${currentPage}/${totalPages}`,
        hits: result.hits.length,
        inserted: stats.inserted,
        updated: stats.updated,
      },
      'Page processed'
    );

    currentPage++;

    // Delay between pages: configured delay + random jitter (0-2s)
    if (currentPage <= totalPages && !shuttingDown) {
      const jitter = Math.random() * 2000;
      const delay = config.bayut.pageDelayMs + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  logger.info(
    { label, totalInserted, totalUpdated },
    'Search combination complete'
  );
}

// ─── Main Entry Point ────────────────────────────────────────────────

async function main() {
  const mode = config.bayut.mode;

  logger.info({
    mode,
    headless: config.bayut.headless,
    pageDelayMs: config.bayut.pageDelayMs,
    circuitBreakThreshold: config.bayut.circuitBreakThreshold,
  }, '=== Bayut Scraper starting ===');

  // 1. Connect to MongoDB
  await db.connect();

  // 2. Launch browser and pass Humbucker challenge
  session = new BayutBrowserSession();
  await session.launch();

  const challengePassed = await session.passChallenge();
  if (!challengePassed) {
    logger.error('Failed to pass initial Humbucker challenge. Exiting.');
    await session.close();
    await db.close();
    process.exit(1);
  }

  // 3. Generate search combinations
  const combinations = generateCombinations();
  logger.info({ combinations: combinations.length }, 'Search combinations generated');

  // 4. Process sequentially (single browser page)
  for (const combo of combinations) {
    if (shuttingDown) break;
    await processSearchCombination(session, combo, mode);
  }

  // 5. Summary
  const stats = await db.getStats('bayut');
  logger.info(stats, '=== Bayut scraping complete. Database summary ===');

  // 6. Clean shutdown
  await session.close();
  await db.close();
  logger.info('Exiting normally.');
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Unhandled fatal error');
  const cleanup = async () => {
    if (session) await session.close().catch(() => {});
    await db.close().catch(() => {});
    process.exit(1);
  };
  cleanup();
});
