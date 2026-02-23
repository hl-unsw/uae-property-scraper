/**
 * Migration 009: Add stale_since sparse index to all raw collections
 *
 * Supports the stale-listing detection system:
 * - Full crawls mark missing listings with stale_since timestamp
 * - Scoring script excludes stale listings
 * - Cleanup job deletes listings stale for > 7 days
 *
 * Sparse index: only indexes documents where stale_since exists,
 * keeping the index small (most documents are active).
 */

const COLLECTIONS = ['propertyfinder_raw', 'dubizzle_raw', 'bayut_raw'];

module.exports = {
  description: 'Add sparse index on stale_since to all raw collections',

  async up(db) {
    for (const name of COLLECTIONS) {
      await db.collection(name).createIndex(
        { stale_since: 1 },
        { name: 'idx_stale_since', sparse: true },
      );
    }
  },

  async down(db) {
    for (const name of COLLECTIONS) {
      await db.collection(name).dropIndex('idx_stale_since').catch(() => {});
    }
  },
};
