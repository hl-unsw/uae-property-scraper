# UAE Property Scraper - Claude Code Guide

## Project Overview

Abu Dhabi rental market scraper & dashboard. Serverless + Static JSON architecture deployed on Vercel.

- **3 platforms**: PropertyFinder (API), Dubizzle (Algolia API), Bayut (Playwright SSR)
- **Database**: MongoDB at `127.0.0.1:27018`, db `uae_real_estate`
- **Frontend**: Vanilla JS dashboard with CN/EN bilingual support

## Full Data Pipeline

When the user says "全量更新", "full pipeline", "跑一遍流水线", or similar, execute these steps in order:

### Step 1: Full Scrape (3 platforms)

Run PropertyFinder and Dubizzle in parallel (they are fast HTTP scrapers). Run Bayut separately with visible browser because it has Captcha (Humbucker challenge).

```bash
# PF + Dubizzle in parallel (background)
npm run scrape:full
npm run scrape:dubizzle:full

# Bayut needs visible browser for Captcha - user may need to intervene
npm run scrape:bayut:debug
```

- `scrape:full` = PropertyFinder full scrape
- `scrape:dubizzle:full` = Dubizzle full scrape
- `scrape:bayut:debug` = Bayut with `BAYUT_HEADLESS=false` (Playwright opens visible browser)
- Bayut Captcha usually auto-resolves in non-headless mode; if stuck, user manually solves it
- PF and Dubizzle can run in parallel; Bayut runs after or in parallel

### Step 2: Targeted Ranking

```bash
npm run search:targeted
```

- Queries all 3 raw collections, filters by target neighborhoods
- Applies weighted scoring (value 30, parking 20, utilities 15, area 15, commission 10, payment 10)
- Selects top 30% as curated listings into `targeted_results`

### Step 3: Chinese Translation

Run both translation scripts in sequence:

```bash
node src/scripts/translate-titles.js
node scripts/apply-translations.js
```

- `translate-titles.js` has a hardcoded map (500+ entries), updates all 4 collections
- `apply-translations.js` has supplementary translations for `targeted_results`
- After running, check for untranslated titles:

```js
// MongoDB query to find untranslated targeted listings
db.targeted_results.aggregate([
  { $match: { $expr: { $eq: ["$title", "$title_zh"] } } },
  { $group: { _id: "$title" } }
])
```

- If missing titles found: use Gemini (`mcp__gemini-cli__ask-gemini`) to batch translate, then `updateMany` in MongoDB and add to `translate-titles.js` for persistence

### Step 4: Export to Static JSON

```bash
npm run export:json
```

- Exports `targeted_results` to `data/static/targeted_results.json`

### Step 5: Git Commit & Push

```bash
git add data/static/targeted_results.json src/scripts/translate-titles.js
git commit -m "data: auto-update YYYY-MM-DD HH:MM [PF+Dubizzle+Bayut] (full)"
git push
```

- Commit message format: `data: auto-update {date} {time} [{sources}] (full|incremental)`
- Sources shorthand: PF = PropertyFinder, Dubizzle, Bayut
- Push to `main` triggers Vercel auto-deploy

## Key Collections

| Collection | Contents |
|---|---|
| `propertyfinder_raw` | Raw PF listings (title at `property.title`) |
| `bayut_raw` | Raw Bayut listings (title at `title`) |
| `dubizzle_raw` | Raw Dubizzle listings (title at `name.en`) |
| `targeted_results` | Scored & filtered curated listings |
| `listings_unified` | Unified view (system.views) |

## Incremental Mode

For lighter daily updates (no Bayut, faster):

```bash
npm run scrape:incremental
npm run scrape:dubizzle:incremental
npm run search:targeted
node src/scripts/translate-titles.js && node scripts/apply-translations.js
npm run export:json
```

## Local Dev

```bash
npm run db:setup     # Start MongoDB Docker
npm run server       # API server on :3000
```

## MongoDB Connection

```
mongodb://admin:uaeSpider2026x@127.0.0.1:27018
```

Use MCP `switch-connection` with this URI to connect.
