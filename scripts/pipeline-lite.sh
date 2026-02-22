#!/bin/bash
# UAE Property Scraper - Lite Pipeline (PF + Dubizzle only)
# Designed for unattended cron execution via OpenClaw.
# Skips Bayut (requires headed browser + manual captcha).
#
# Flow: preflight -> scrape PF -> scrape Dubizzle -> score -> export -> git push
# Expected runtime: ~90 seconds (incremental), longer for full
#
# Usage: bash scripts/pipeline-lite.sh              # incremental (default)
#        SCRAPE_MODE=full bash scripts/pipeline-lite.sh  # full scrape

set -euo pipefail

SCRAPE_MODE="${SCRAPE_MODE:-incremental}"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

LOG_PREFIX="[pipeline-lite $(date +'%H:%M:%S')]"
log()  { echo "$LOG_PREFIX $1"; }
fail() { echo "$LOG_PREFIX ERROR: $1" >&2; exit 1; }

# ─── Preflight Checks ────────────────────────────────────────
log "Preflight checks..."

# Node.js
command -v node >/dev/null 2>&1 || fail "node not found"

# MongoDB reachable (via quick JS ping)
node -e "
  const { MongoClient } = require('mongodb');
  const c = require('./src/config');
  const client = new MongoClient(c.mongo.uri, { serverSelectionTimeoutMS: 5000 });
  client.connect().then(() => client.close()).catch(() => process.exit(1));
" || fail "MongoDB unreachable — is Docker running?"

# Git clean working tree (only data/static/ changes allowed)
if ! git diff --quiet -- ':!data/static'; then
  fail "Uncommitted non-data changes in working tree. Aborting to avoid conflict."
fi

# ─── 1. Scrapes ────────────────────────────────────────────────
log "[1/4] Scraping PropertyFinder ($SCRAPE_MODE)..."
npm run "scrape:$SCRAPE_MODE" 2>&1 || fail "PropertyFinder scrape failed"

log "[1/4] Scraping Dubizzle ($SCRAPE_MODE)..."
npm run "scrape:dubizzle:$SCRAPE_MODE" 2>&1 || fail "Dubizzle scrape failed"

# ─── 2. Global Ranking ───────────────────────────────────────
log "[2/4] Running targeted scoring..."
npm run search:targeted 2>&1 || fail "Targeted scoring failed"

# ─── 3. Export & Push ─────────────────────────────────────────
# Pull BEFORE export so the tree is clean for rebase.
# Export creates dirty files in data/static/ which would block rebase.
log "[3/4] Syncing with remote..."
git checkout -- data/static/ 2>/dev/null || true
git pull --rebase --quiet origin main || fail "Git pull --rebase failed. Manual resolution needed."

log "[3/4] Exporting MongoDB to static JSON..."
npm run export:json 2>&1 || fail "JSON export failed"

# ─── 4. Git Commit & Push ────────────────────────────────────
log "[4/4] Committing and pushing..."

git add data/static/*.json

if git diff --staged --quiet; then
  log "No data changes. Skipping push."
else
  git commit -m "data: auto-update $(date +'%Y-%m-%d %H:%M') [PF+Dubizzle] ($SCRAPE_MODE)"
  git push origin main || fail "Git push failed"
  log "Pushed. Vercel will redeploy."
fi

log "Done. Total: ${SECONDS}s"
