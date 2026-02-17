const config = require('../config');

/**
 * Circuit breaker for incremental scraping mode.
 *
 * Tracks consecutive already-existing listings. When the count reaches
 * the threshold, it signals the crawler to stop paginating for the
 * current search combination.
 *
 * Design note: We do NOT try to filter "featured" listings because
 * the API response has no reliable featured/promoted flag. Instead,
 * we use a generous threshold (default 50) to absorb any interleaved
 * promoted old listings without false-positive circuit breaks.
 */
class CircuitBreaker {
  constructor(threshold = config.scraper.circuitBreakThreshold) {
    this.threshold = threshold;
    this.consecutiveExisting = 0;
  }

  /**
   * Process a batch of listing IDs against the set of existing IDs.
   * Updates the consecutive counter.
   *
   * @param {string[]} batchIds - IDs from the current API page (in order)
   * @param {Set<string>} existingIds - IDs already in MongoDB
   * @returns {boolean} true if circuit should break (stop paginating)
   */
  processBatch(batchIds, existingIds) {
    for (const id of batchIds) {
      if (existingIds.has(id)) {
        this.consecutiveExisting++;
        if (this.consecutiveExisting >= this.threshold) {
          return true; // BREAK
        }
      } else {
        // Reset on any new listing
        this.consecutiveExisting = 0;
      }
    }
    return false;
  }

  reset() {
    this.consecutiveExisting = 0;
  }
}

module.exports = CircuitBreaker;
