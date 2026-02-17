# Database Migration Guide

## Overview

This project uses a versioned migration system to manage MongoDB schema changes. Each migration is a numbered JavaScript file with `up()` and `down()` functions, tracked in a `_migrations` collection so each runs exactly once.

```
scripts/migrations/
├── runner.js                    # Migration engine
├── backup.sh                    # Backup & restore utility
└── versions/
    ├── 001_initial_collections_and_indexes.js
    ├── 002_add_bedroom_furnishing_indexes.js
    ├── 003_add_geospatial_index.js
    ├── 004_add_text_search_index.js
    ├── 005_add_price_history_tracking.js
    └── 006_add_cross_platform_dedup_view.js
```

---

## Quick Start

```bash
# Ensure MongoDB is running
npm run db:setup

# Check migration status
npm run db:migrate:status

# Run all pending migrations
npm run db:migrate

# Verify
npm run db:migrate:status
```

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Run all pending migrations in order |
| `npm run db:migrate:status` | Show which migrations are applied / pending |
| `npm run db:migrate:rollback -- 3` | Rollback migration version 3 |
| `npm run db:backup` | Create a timestamped backup |
| `npm run db:backup -- my_tag` | Create a named backup |
| `npm run db:backup:list` | List all available backups |
| `npm run db:restore -- ~/uae_spider_data/backups/uae_real_estate_my_tag` | Restore from backup |

---

## Migration Details

### 001 — Initial Collections & Indexes

**What it does:**
- Creates `propertyfinder_raw`, `dubizzle_raw`, `bayut_raw` collections
- Adds unique index on `listing_id` for all three collections
- Adds compound index on `location + price` for Property Finder
- Adds descending index on `crawled_at` for incremental lookups

**Indexes created:**
```
idx_listing_id_unique    { listing_id: 1 }              UNIQUE
idx_location_price       { property.location.full_name: 1, property.price.value: 1 }
idx_crawled_at_desc      { crawled_at: -1 }
```

**Rollback:** Drops the three named indexes. Collections are preserved.

---

### 002 — Bedroom & Furnishing Indexes

**What it does:**
- Adds single-field indexes for the two most-used dashboard filters
- Adds compound index for "N bedrooms under X price" queries

**Indexes created:**
```
idx_bedrooms             { property.bedrooms: 1 }
idx_furnished            { property.furnished: 1 }
idx_bedrooms_price       { property.bedrooms: 1, property.price.value: 1 }
```

**Rollback:** Drops the three indexes.

---

### 003 — Geospatial Index (2dsphere)

**What it does:**
- Transforms existing `property.location.coordinates` (lat/lon) into a GeoJSON `geo` field on every document:
  ```json
  { "geo": { "type": "Point", "coordinates": [54.32, 24.45] } }
  ```
  Note: GeoJSON uses `[longitude, latitude]` order.
- Creates a `2dsphere` index for proximity queries.

**Enables queries like:**
```javascript
// Find listings within 5km of a point
db.propertyfinder_raw.find({
  geo: {
    $near: {
      $geometry: { type: "Point", coordinates: [54.4085, 24.4962] },
      $maxDistance: 5000
    }
  }
})
```

**Rollback:** Drops the index and removes the `geo` field from all documents.

---

### 004 — Text Search Index

**What it does:**
- Creates a weighted text index across three fields:
  - `property.title` (weight: 10) — highest priority
  - `property.location.full_name` (weight: 5)
  - `property.amenity_names` (weight: 2)

**Enables queries like:**
```javascript
// Full-text search
db.propertyfinder_raw.find({ $text: { $search: "furnished corniche sea view" } })

// With relevance score
db.propertyfinder_raw.find(
  { $text: { $search: "marina apartment" } },
  { score: { $meta: "textScore" } }
).sort({ score: { $meta: "textScore" } })
```

**Note:** MongoDB allows only one text index per collection. If you need to change the fields, rollback this migration first.

**Rollback:** Drops the text index.

---

### 005 — Price History Tracking

**What it does:**
- Adds a `price_history` array to every existing listing, initialized with the current price:
  ```json
  {
    "price_history": [
      { "value": 65000, "currency": "AED", "period": "yearly", "recorded_at": "2026-02-17T..." }
    ]
  }
  ```
- Creates a sparse index on `price_history.1` (second element) to efficiently find listings that have had at least one price change.

**Scraper integration required:** After running this migration, the scraper's upsert logic should be enhanced to detect price changes and `$push` old prices:
```javascript
// In the bulkWrite updateOne operation, add:
{
  $push: {
    price_history: {
      $each: [{ value: oldPrice, currency: "AED", period: "yearly", recorded_at: new Date() }],
      $position: 0  // prepend
    }
  }
}
```

**Rollback:** Drops the index and removes `price_history` from all documents.

---

### 006 — Cross-Platform Unified View

**What it does:**
- Creates a MongoDB **view** (not a physical collection) called `listings_unified`
- Merges all three source collections (`propertyfinder_raw`, `dubizzle_raw`, `bayut_raw`) using `$unionWith`
- Normalizes each source into a common flat schema:

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | `"propertyfinder"`, `"dubizzle"`, or `"bayut"` |
| `listing_id` | string | Platform-specific unique ID |
| `title` | string | Listing title |
| `price_value` | number | Price in AED |
| `price_currency` | string | Always `"AED"` |
| `price_period` | string | `"yearly"`, `"monthly"`, etc. |
| `bedrooms` | string | Bedroom count |
| `bathrooms` | string | Bathroom count |
| `size_sqft` | number | Area in sqft |
| `furnished` | string | Furnishing status |
| `location` | string | Full location name |
| `lat` | number | Latitude |
| `lon` | number | Longitude |
| `amenities` | array | Amenity name strings |
| `agent_name` | string | Agent name |
| `broker_name` | string | Broker/agency name |
| `url` | string | Original listing URL |
| `listed_date` | date | When the listing was posted |
| `crawled_at` | date | When we scraped it |

**Query the unified view:**
```javascript
// All 2-bed apartments under 60k across all platforms
db.listings_unified.find({
  bedrooms: "2",
  price_value: { $lte: 60000 }
}).sort({ price_value: 1 })

// Count by platform
db.listings_unified.aggregate([
  { $group: { _id: "$source", count: { $sum: 1 } } }
])
```

**Note:** Views are computed on read. For large datasets, consider materializing via `$merge` to a physical collection if query performance is an issue.

**Rollback:** Drops the view.

---

## Writing New Migrations

### File Naming Convention

```
{NNN}_{description}.js
```
- `NNN`: Three-digit zero-padded version number (e.g., `007`)
- `{description}`: Snake_case description

### Template

```javascript
/**
 * Migration NNN: Description
 */

module.exports = {
  description: 'Human readable description of what this does',

  async up(db) {
    // db is a MongoDB Db instance
    // Perform schema changes here
  },

  async down(db) {
    // Reverse the changes made in up()
    // Use .catch(() => {}) for idempotent drops
  },
};
```

### Rules

1. **Always provide `down()`** — Every `up()` must have a corresponding `down()` that fully reverses the change.
2. **Idempotent drops** — Use `.catch(() => {})` on `dropIndex` / `drop` to handle cases where the target doesn't exist.
3. **No data loss in `down()`** — Dropping indexes is safe. Dropping fields or collections should be clearly documented.
4. **Test both directions** — Run `migrate`, verify, `rollback`, verify, `migrate` again.
5. **Never modify a released migration** — If a migration has been run in production, create a new migration to fix it.

---

## Backup & Restore Workflow

### Before Any Migration

```bash
# Always backup before running migrations
npm run db:backup -- pre_migration_006

# Run migration
npm run db:migrate

# Verify data integrity
npm run db:migrate:status
```

### If Something Goes Wrong

```bash
# Option A: Rollback the specific migration
npm run db:migrate:rollback -- 6

# Option B: Full restore from backup
npm run db:restore -- ~/uae_spider_data/backups/uae_real_estate_pre_migration_006
```

### Backup Storage Location

All backups are stored in `~/uae_spider_data/backups/`. Each backup is a directory containing BSON dump files, one per collection:

```
~/uae_spider_data/backups/
└── uae_real_estate_pre_migration_006/
    ├── propertyfinder_raw.bson
    ├── propertyfinder_raw.metadata.json
    ├── dubizzle_raw.bson
    ├── dubizzle_raw.metadata.json
    ├── bayut_raw.bson
    ├── bayut_raw.metadata.json
    └── _migrations.bson
```

---

## Migration Execution Order

For a fresh database, run `npm run db:migrate` to apply all in sequence:

```
001 → Create collections + listing_id unique + location/price + crawled_at indexes
002 → Add bedrooms, furnished, bedrooms+price indexes
003 → Transform coordinates to GeoJSON + 2dsphere index
004 → Text search index on title/location/amenities
005 → Initialize price_history arrays + sparse index
006 → Create listings_unified cross-platform view
```

For an existing database with data (e.g., the 341 listings already crawled), the runner will detect which migrations have already been applied and only run the pending ones.
