const config = require('../config');
const logger = require('../lib/logger');
const db = require('../lib/database');
const { fetchDubizzlePage } = require('./fetcher');
const { generateCombinations } = require('./search-combinations');
const CircuitBreaker = require('../scraper/circuit-breaker');

// ─── Graceful Shutdown ───────────────────────────────────────────────
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received. Cleaning up...');
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Process One Search Combination ─────────────────────────────────

async function processSearchCombination(combo, mode, seenIds) {
  const { label } = combo;
  const isIncremental = mode === 'incremental';
  const breaker = isIncremental
    ? new CircuitBreaker(config.dubizzle.circuitBreakThreshold)
    : null;

  // Algolia uses 0-indexed pages
  let currentPage = 0;
  let totalPages = 1;
  let totalInserted = 0;
  let totalUpdated = 0;

  logger.info({ label, mode }, 'Starting Dubizzle search combination');

  while (currentPage < totalPages) {
    if (shuttingDown) {
      logger.info({ label, currentPage }, 'Shutdown: stopping combination early');
      break;
    }

    const result = await fetchDubizzlePage(combo, currentPage);

    if (!result || result.hits.length === 0) {
      logger.debug({ label, currentPage }, 'No more hits');
      break;
    }

    totalPages = result.nbPages;

    // Collect listing IDs for stale detection (full crawl)
    if (seenIds) {
      for (const item of result.hits) {
        if (item.id) seenIds.add(String(item.id));
      }
    }

    // Incremental: circuit breaker check
    if (isIncremental && breaker) {
      const ids = result.hits
        .filter((item) => item.id)
        .map((item) => String(item.id));

      if (ids.length > 0) {
        const existingIds = await db.checkExistingIds('dubizzle', ids);
        const shouldBreak = breaker.processBatch(ids, existingIds);

        if (shouldBreak) {
          logger.info(
            { label, currentPage, consecutiveExisting: breaker.consecutiveExisting },
            'Circuit breaker triggered — stopping pagination',
          );
          const cbStats = await db.bulkUpsertListings('dubizzle', result.hits);
          totalInserted += cbStats.inserted;
          totalUpdated += cbStats.updated;
          break;
        }
      }
    }

    // Save to MongoDB
    const stats = await db.bulkUpsertListings('dubizzle', result.hits);
    totalInserted += stats.inserted;
    totalUpdated += stats.updated;

    logger.info(
      {
        label,
        page: `${currentPage + 1}/${totalPages}`,
        hits: result.hits.length,
        nbHits: result.nbHits,
        inserted: stats.inserted,
        updated: stats.updated,
      },
      'Page processed',
    );

    currentPage++;

    // Polite delay to avoid Algolia rate limiting (429)
    if (currentPage < totalPages && !shuttingDown) {
      const jitter = Math.random() * 1000;
      const delay = config.dubizzle.pageDelayMs + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  logger.info({ label, totalInserted, totalUpdated }, 'Search combination complete');
}

// ─── Main Entry Point ────────────────────────────────────────────────

async function main() {
  const mode = config.dubizzle.mode;

  logger.info(
    {
      mode,
      pageDelayMs: config.dubizzle.pageDelayMs,
      circuitBreakThreshold: config.dubizzle.circuitBreakThreshold,
    },
    '=== Dubizzle Scraper starting (Pure HTTP / Algolia) ===',
  );

  // 1. Connect to MongoDB
  await db.connect();

  // 2. Generate search combinations
  const combinations = generateCombinations();
  logger.info({ combinations: combinations.length }, 'Search combinations generated');

  // 3. Process sequentially
  const isFullCrawl = mode === 'full';
  const seenIds = isFullCrawl ? new Set() : null;

  for (const combo of combinations) {
    if (shuttingDown) break;
    await processSearchCombination(combo, mode, seenIds);
  }

  // 4. Mark stale listings (full crawl only, if not interrupted)
  if (isFullCrawl && !shuttingDown && seenIds.size > 0) {
    await db.markStaleListings('dubizzle', [...seenIds]);
  }

  // 5. Summary
  const stats = await db.getStats('dubizzle');
  logger.info(stats, '=== Dubizzle scraping complete. Database summary ===');

  // 5. Clean shutdown
  await db.close();
  logger.info('Exiting normally.');
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Unhandled fatal error');
  db.close().catch(() => {});
  process.exit(1);
});
