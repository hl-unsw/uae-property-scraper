# UAE Property Scraper

Abu Dhabi rental market data scraper and dashboard. Extracts listings from Property Finder via their Next.js internal data API, stores in MongoDB, and serves a web dashboard for browsing and analysis.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Scraper Daemon                     │
│  ┌───────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ Build ID  │  │  Token    │  │   Circuit      │  │
│  │ Resolver  │  │  Bucket   │  │   Breaker      │  │
│  │ (auto-    │  │  Rate     │  │   (incremental │  │
│  │  heal on  │  │  Limiter  │  │    early exit) │  │
│  │  404)     │  │  +Jitter  │  │                │  │
│  └─────┬─────┘  └─────┬─────┘  └───────┬────────┘  │
│        └──────────┬────┘               │            │
│              ┌────▼────┐    ┌──────────▼──┐         │
│              │ Fetcher │    │  Cookie Jar  │         │
│              │ (axios) │◄───│  + UA Pool   │         │
│              └────┬────┘    └─────────────┘         │
└───────────────────┼─────────────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │   Property Finder   │
         │  _next/data/ API    │
         └─────────────────────┘
                    │
         ┌──────────▼──────────┐
         │      MongoDB        │
         │  (Docker, localhost) │
         └──────────┬──────────┘
                    │
┌───────────────────┼─────────────────────────────────┐
│            Express API Server                        │
│  GET /api/listings  GET /api/stats  GET /api/bedrooms│
└───────────────────┬─────────────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │  Frontend Dashboard │
         │  (Dark theme SPA)   │
         └─────────────────────┘
```

## Features

- **Two scraping modes**: Full (initial bulk) and Incremental (daily updates)
- **Auto-healing**: Automatically refreshes Build ID on 404 errors
- **Token bucket rate limiting** with uniform distribution + random jitter
- **Circuit breaker**: Stops pagination when 50 consecutive listings already exist in DB
- **Cookie session management**: Maintains cookies across requests
- **Graceful shutdown**: Handles SIGINT/SIGTERM, drains queue before exit
- **Structured logging**: JSON logs via pino with request stats
- **MongoDB bulk upsert**: Deduplication by listing ID, `ordered: false` for fault tolerance
- **Dashboard**: Dark-themed web UI with stats, bedroom distribution chart, filters, pagination

## Prerequisites

- **Node.js** >= 22 (for ESM-in-CJS support)
- **Docker Desktop** (for MongoDB)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env    # Edit .env if needed

# 3. Start MongoDB
npm run db:setup

# 4. Run scraper
npm run scrape:incremental   # Daily updates (recommended)
npm run scrape:full           # Initial bulk scrape

# 5. Start dashboard
npm run server               # http://localhost:3000
```

## Project Structure

```
src/
├── config/index.js              # Centralized configuration
├── lib/
│   ├── logger.js                # pino structured logging
│   ├── database.js              # MongoDB connection, bulk upsert, queries
│   ├── rate-limiter.js          # Token bucket (async-sema, uniformDistribution)
│   ├── cookie-manager.js        # axios + tough-cookie jar + UA rotation
│   └── build-id.js              # Extract Build ID from search page
├── scraper/
│   ├── index.js                 # Main entry: orchestrator + graceful shutdown
│   ├── fetcher.js               # API requests + 404 auto-recovery
│   ├── search-combinations.js   # Cartesian product of search filters
│   └── circuit-breaker.js       # Incremental mode early-exit logic
├── api/
│   ├── server.js                # Express server + static file hosting
│   └── routes/listings.js       # REST endpoints for frontend
└── frontend/
    ├── index.html               # Dashboard page
    ├── css/styles.css            # Dark theme styles
    └── js/app.js                # Stats, charts, listing cards, pagination
```

## Configuration

All settings via `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://127.0.0.1:27017` | MongoDB connection string |
| `MODE` | `incremental` | Scraping mode: `full` or `incremental` |
| `RATE_LIMIT_RPM` | `8` | Max requests per minute (uniformly distributed) |
| `CONCURRENCY` | `2` | Parallel scraping workers |
| `CIRCUIT_BREAK_THRESHOLD` | `50` | Consecutive existing listings before early exit |
| `API_PORT` | `3000` | Dashboard server port |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/listings?page=1&limit=20&minPrice=&maxPrice=&bedrooms=&furnished=&search=` | Paginated listing search |
| `GET /api/stats` | Aggregate stats (count, avg price, price range, avg size) |
| `GET /api/bedrooms` | Bedroom count distribution |

## Technical Notes

### Property Finder API

Property Finder runs multiple Next.js apps on the same domain. The search app uses `basePath: "/search"`, so its data routes are at `/search/_next/data/{buildId}/en/search.json`. The Build ID **must** be extracted from `/en/search` (not the homepage).

### Anti-Detection

- Persistent cookie jar (AWS CloudFront session cookies)
- Rotating User-Agent pool (5 real browser UAs)
- Token bucket with uniform distribution (no burst)
- 500ms-2000ms random jitter per request
- `x-nextjs-data: 1` header to mimic SPA navigation

### MongoDB Schema

- Database: `uae_real_estate`
- Collections: `propertyfinder_raw`, `dubizzle_raw`, `bayut_raw`
- Unique index on `listing_id`
- Raw JSON preserved as-is from API, with `crawled_at` and `spider_source` metadata

## Scripts

| Command | Description |
|---------|-------------|
| `npm run scrape:full` | Run full scrape (all historical data) |
| `npm run scrape:incremental` | Run incremental scrape (new listings only) |
| `npm run server` | Start dashboard on port 3000 |
| `npm run dev` | Run dashboard + incremental scrape concurrently |
| `npm run db:setup` | Start MongoDB Docker container |
| `npm run db:stop` | Stop MongoDB container |

## License

UNLICENSED - Private project.
