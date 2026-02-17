/**
 * Migration Runner
 *
 * Executes versioned migration scripts in order. Tracks completed
 * migrations in a `_migrations` collection so each script runs
 * exactly once, even across repeated invocations.
 *
 * Usage:
 *   node scripts/migrations/runner.js              # Run all pending
 *   node scripts/migrations/runner.js --status     # Show status only
 *   node scripts/migrations/runner.js --rollback 3 # Rollback migration 3
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGO_DB_NAME || 'uae_real_estate';
const MIGRATIONS_COLLECTION = '_migrations';

// ─── Discover migration files ────────────────────────────────────

function discoverMigrations() {
  const dir = path.join(__dirname, 'versions');
  if (!fs.existsSync(dir)) {
    console.error(`Migration directory not found: ${dir}`);
    process.exit(1);
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.match(/^\d{3}_.+\.js$/))
    .sort()
    .map((filename) => {
      const mod = require(path.join(dir, filename));
      const version = parseInt(filename.split('_')[0], 10);
      return {
        version,
        filename,
        description: mod.description || filename,
        up: mod.up,
        down: mod.down,
      };
    });
}

// ─── Core runner ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const statusOnly = args.includes('--status');
  const rollbackIdx = args.indexOf('--rollback');
  const rollbackVersion =
    rollbackIdx !== -1 ? parseInt(args[rollbackIdx + 1], 10) : null;

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const migCol = db.collection(MIGRATIONS_COLLECTION);

  // Ensure index on version
  await migCol.createIndex({ version: 1 }, { unique: true });

  const allMigrations = discoverMigrations();
  const completed = await migCol.find().sort({ version: 1 }).toArray();
  const completedVersions = new Set(completed.map((m) => m.version));

  // ── Status mode ──
  if (statusOnly) {
    console.log('\n  Migration Status\n  ================\n');
    for (const m of allMigrations) {
      const done = completedVersions.has(m.version);
      const mark = done ? '\x1b[32m DONE \x1b[0m' : '\x1b[33m PENDING\x1b[0m';
      const ts = done
        ? completed.find((c) => c.version === m.version)?.applied_at?.toISOString()
        : '';
      console.log(`  [${mark}] ${m.filename}  ${ts}`);
    }
    console.log(
      `\n  Total: ${allMigrations.length} | Done: ${completedVersions.size} | Pending: ${allMigrations.length - completedVersions.size}\n`
    );
    await client.close();
    return;
  }

  // ── Rollback mode ──
  if (rollbackVersion !== null) {
    const migration = allMigrations.find((m) => m.version === rollbackVersion);
    if (!migration) {
      console.error(`Migration version ${rollbackVersion} not found`);
      process.exit(1);
    }
    if (!completedVersions.has(rollbackVersion)) {
      console.error(`Migration ${rollbackVersion} was never applied`);
      process.exit(1);
    }
    if (!migration.down) {
      console.error(`Migration ${rollbackVersion} has no down() function`);
      process.exit(1);
    }

    console.log(`\n  Rolling back: ${migration.filename}`);
    const session = client.startSession();
    try {
      await migration.down(db, session);
      await migCol.deleteOne({ version: rollbackVersion });
      console.log(`  Rollback complete.\n`);
    } catch (err) {
      console.error(`  Rollback FAILED: ${err.message}`);
      process.exit(1);
    } finally {
      await session.endSession();
    }

    await client.close();
    return;
  }

  // ── Run pending migrations ──
  const pending = allMigrations.filter((m) => !completedVersions.has(m.version));

  if (pending.length === 0) {
    console.log('\n  All migrations are up to date.\n');
    await client.close();
    return;
  }

  console.log(`\n  Running ${pending.length} pending migration(s)...\n`);

  for (const migration of pending) {
    console.log(`  [${migration.version}] ${migration.description}`);
    const startTime = Date.now();

    try {
      await migration.up(db);
      await migCol.insertOne({
        version: migration.version,
        filename: migration.filename,
        description: migration.description,
        applied_at: new Date(),
        duration_ms: Date.now() - startTime,
      });
      console.log(
        `         Done (${Date.now() - startTime}ms)\n`
      );
    } catch (err) {
      console.error(`         FAILED: ${err.message}`);
      console.error(`         Stopping. Fix the issue and re-run.\n`);
      process.exit(1);
    }
  }

  console.log('  All migrations applied successfully.\n');
  await client.close();
}

main().catch((err) => {
  console.error('Migration runner error:', err);
  process.exit(1);
});
