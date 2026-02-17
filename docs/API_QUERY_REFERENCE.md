# API Query Parameter Reference

This document is the single source of truth for all query parameters across both layers of the system. Designed for AI agents to translate natural language into correct API calls.

---

## Layer 1: Local Dashboard API (Express)

Base URL: `http://localhost:3000/api`

### GET /api/listings

Paginated search over locally stored listings.

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `page` | integer | `1` | Page number (1-indexed) | `page=3` |
| `limit` | integer | `20` | Results per page (max recommended: 100) | `limit=50` |
| `source` | string | `pf` | Data source collection | `pf`, `dubizzle`, `bayut` |
| `minPrice` | integer | — | Minimum price (AED, inclusive) | `minPrice=30000` |
| `maxPrice` | integer | — | Maximum price (AED, inclusive) | `maxPrice=80000` |
| `bedrooms` | string | — | Bedroom count. `0` = Studio | `bedrooms=2` |
| `furnished` | string | — | Furnishing status | `YES`, `NO`, `PARTLY` |
| `search` | string | — | Keyword search (regex on title, case-insensitive) | `search=Corniche` |

**Response:**
```json
{
  "docs": [ ...listing objects... ],
  "total": 1139,
  "page": 1,
  "totalPages": 57
}
```

### GET /api/stats

Aggregate statistics for a data source.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | string | `pf` | Data source: `pf`, `dubizzle`, `bayut` |

**Response:**
```json
{
  "totalListings": 341,
  "avgPrice": 85000,
  "minPrice": 18000,
  "maxPrice": 950000,
  "avgSize": 1200,
  "lastCrawled": "2026-02-17T19:17:11.313Z"
}
```

### GET /api/bedrooms

Bedroom count distribution for charts.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | string | `pf` | Data source: `pf`, `dubizzle`, `bayut` |

**Response:**
```json
[
  { "_id": "0", "count": 45 },
  { "_id": "1", "count": 120 },
  { "_id": "2", "count": 89 }
]
```
Note: `_id` is the bedroom count as string. `"0"` = Studio, `"studio"` may also appear.

---

## Layer 2: Property Finder Upstream API (Scraper)

This is the external API the scraper calls to fetch raw data from propertyfinder.ae.

**Method:** GET
**URL Template:** `https://www.propertyfinder.ae/search/_next/data/{BUILD_ID}/en/search.json?{params}`
**Content-Type:** application/json

### Required Headers

| Header | Value | Notes |
|--------|-------|-------|
| `user-agent` | Real browser UA | Mandatory. Rotate from a pool |
| `accept` | `*/*` | Mandatory |
| `referer` | `https://www.propertyfinder.ae/en/search` | Mandatory |
| `x-nextjs-data` | `1` | Recommended (mimics SPA navigation) |
| `cookie` | Session cookies | Mandatory. Maintain via cookie jar |

### Location & Category Parameters

#### `l` — City / Region ID

| Value | City |
|-------|------|
| `1` | Dubai |
| `2` | Ajman |
| `3` | Ras Al Khaimah |
| `4` | Sharjah |
| `5` | Umm Al Quwain |
| `6` | **Abu Dhabi** |
| `7` | Fujairah |

#### `c` — Transaction Category

| Value | Category |
|-------|----------|
| `1` | Buy (residential sale) |
| `2` | **Rent (residential)** |
| `3` | Commercial buy |
| `4` | Commercial rent |

#### `t` — Property Type

| Value | Type | Notes |
|-------|------|-------|
| `1` | Apartment | Most common |
| `2` | Villa compound | |
| `3` | Duplex | |
| `4` | Short term / daily | |
| `14` | Land / plot | |
| `18` | Full floor | |
| `20` | Penthouse | |
| `21` | Whole building | |
| `22` | Townhouse | |
| `35` | Villa | Standalone |
| `45` | Hotel apartment | |

### Bedroom & Bathroom Filters

#### `bdr[]` — Bedrooms (array, supports multiple)

| Value | Meaning |
|-------|---------|
| `0` | Studio |
| `1` | 1 Bedroom |
| `2` | 2 Bedrooms |
| `3` | 3 Bedrooms |
| `4` | 4 Bedrooms |
| `5` | 5 Bedrooms |
| `6` | 6 Bedrooms |
| `7` | 7 Bedrooms |
| `8` | 7+ Bedrooms |

Multiple values: `bdr[]=1&bdr[]=2` means "1 OR 2 bedrooms".

#### `btr[]` — Bathrooms (array, supports multiple)

| Value | Meaning |
|-------|---------|
| `1` | 1 Bathroom |
| `2` | 2 Bathrooms |
| `3` | 3 Bathrooms |
| `4` | 4 Bathrooms |
| `5` | 5 Bathrooms |
| `6` | 6 Bathrooms |
| `7` | 7+ Bathrooms |

### Price Filters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `pf` | integer | Minimum price (AED) | `pf=30000` |
| `pt` | integer | Maximum price (AED) | `pt=80000` |
| `rp` | string | Rent period | See below |

#### `rp` — Rent Period

| Value | Period |
|-------|--------|
| `y` | Yearly |
| `m` | Monthly |
| `w` | Weekly |
| `d` | Daily |

Note: Price values correspond to the selected rent period. A `pf=5000` with `rp=m` means "minimum 5000 AED/month".

### Area Filters

| Parameter | Type | Description | Unit | Example |
|-----------|------|-------------|------|---------|
| `af` | integer | Minimum area | sqft | `af=400` |
| `at` | integer | Maximum area | sqft | `at=1500` |

### Furnishing

#### `fu` — Furnishing Status

| Value | Meaning |
|-------|---------|
| `0` | All (no filter) |
| `1` | Furnished |
| `2` | Unfurnished |
| `3` | Partly furnished |

### Amenities

#### `am[]` — Amenities (array, supports multiple)

| Code | Amenity |
|------|---------|
| `AC` | Central A/C |
| `BA` | Balcony |
| `BB` | BBQ area |
| `BW` | Built-in wardrobes |
| `CP` | Covered parking |
| `GY` | Private gym |
| `JA` | Private jacuzzi |
| `MR` | Maid's room |
| `PA` | Pets allowed |
| `PG` | Private garden |
| `PP` | Private pool |
| `SE` | Security |
| `SP` | Shared pool |
| `SY` | Shared gym |
| `VL` | View of landmark |
| `VW` | View of water |
| `ST` | Study |
| `SR` | Shared spa |
| `WC` | Walk-in closet |
| `KA` | Kitchen appliances |
| `CF` | Concierge |
| `DS` | Driver's room |
| `BC` | Beach access |
| `CW` | Co-working space |

Multiple values: `am[]=BA&am[]=SP&am[]=PA` means "has balcony AND pool AND pets allowed".

### Sorting

#### `ob` — Order By

| Value | Sort Order |
|-------|------------|
| `mr` | Featured (default, promoted first) |
| `nd` | Newest (most recently listed first) |
| `pa` | Price: low to high |
| `pd` | Price: high to low |
| `sa` | Size: small to large |
| `sd` | Size: large to small |

### Pagination

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-indexed) |

Each page returns ~25 listings. Total pages available in response at `pageProps.meta.page_count`.

### Geospatial / Commute Time Filters

#### `tt[]` — Travel Time Target (array)

Format: `{POI_ID},{LAT},{LON},{MODE},{MINUTES},{ORDER}`

| Field | Description |
|-------|-------------|
| POI_ID | Place-of-interest ID (from Property Finder's location autocomplete) |
| LAT | Latitude (decimal, e.g. `24.4962`) |
| LON | Longitude (decimal, e.g. `54.4085`) |
| MODE | Travel mode (see below) |
| MINUTES | Maximum commute time in minutes |
| ORDER | Priority order (1-based integer) |

**Travel Modes:**

| Mode | Description |
|------|-------------|
| `driving` | Normal driving conditions |
| `driving_peak` | Rush hour / peak traffic |
| `walking` | Walking |
| `public_transport` | Public transportation |

Example: `tt[]=70030076197471004,24.4962,54.4085,driving,45,1`

Meaning: "Within 45 minutes driving distance from coordinates 24.4962, 54.4085"

#### `tto` — Travel Time Operator (when using multiple `tt[]`)

| Value | Meaning |
|-------|---------|
| `intersection` | Must be within commute range of ALL targets |
| `union` | Must be within commute range of ANY target |

---

## Natural Language Mapping Guide

This section helps AI agents translate human queries to parameters.

### Location Synonyms

| User might say | Parameter |
|----------------|-----------|
| "Abu Dhabi", "AD", "阿布达比" | `l=6` |
| "Dubai", "迪拜" | `l=1` |
| "Sharjah", "沙迦" | `l=4` |
| "Ras Al Khaimah", "RAK" | `l=3` |
| "Ajman", "阿治曼" | `l=2` |
| "Fujairah", "富查伊拉" | `l=7` |

### Property Type Synonyms

| User might say | Parameter |
|----------------|-----------|
| "apartment", "flat", "公寓", "apt" | `t=1` |
| "villa", "别墅", "独栋" | `t=35` |
| "townhouse", "联排", "排屋" | `t=22` |
| "penthouse", "顶层", "顶楼" | `t=20` |
| "hotel apartment", "酒店式公寓" | `t=45` |
| "studio", "单间", "开间" | `t=1` + `bdr[]=0` |
| "duplex", "复式" | `t=3` |

### Bedroom Synonyms

| User might say | Parameter |
|----------------|-----------|
| "studio", "单间", "开间", "0 bedroom" | `bdr[]=0` |
| "1 bed", "one bedroom", "一居", "一房" | `bdr[]=1` |
| "2 bed", "two bedroom", "两居", "两房" | `bdr[]=2` |
| "3 bed", "three bedroom", "三居", "三房" | `bdr[]=3` |
| "1-2 bedrooms" | `bdr[]=1&bdr[]=2` |
| "3 bedrooms or more", "3+" | `bdr[]=3&bdr[]=4&bdr[]=5&bdr[]=6&bdr[]=7&bdr[]=8` |

### Price Synonyms

| User might say | Parameters |
|----------------|------------|
| "under 50k", "50000以下", "below 50000" | `pt=50000` |
| "above 80k", "80000以上", "at least 80000" | `pf=80000` |
| "30k to 60k", "3万到6万" | `pf=30000&pt=60000` |
| "budget", "cheap", "便宜" | `ob=pa` (sort low to high) |
| "expensive", "luxury", "高端" | `ob=pd` (sort high to low) |
| "monthly rent" | `rp=m` |
| "yearly rent", "annual" | `rp=y` |
| "daily rent", "short term" | `rp=d` |

### Furnishing Synonyms

| User might say | Parameter |
|----------------|-----------|
| "furnished", "带家具", "精装" | `fu=1` |
| "unfurnished", "毛坯", "空房" | `fu=2` |
| "partly furnished", "半装修" | `fu=3` |

### Amenity Synonyms

| User might say | Parameter |
|----------------|-----------|
| "has pool", "swimming pool", "游泳池" | `am[]=SP` (shared) or `am[]=PP` (private) |
| "gym", "fitness", "健身房" | `am[]=SY` (shared) or `am[]=GY` (private) |
| "parking", "停车位", "车位" | `am[]=CP` |
| "balcony", "阳台" | `am[]=BA` |
| "pet friendly", "can have pets", "可养宠物" | `am[]=PA` |
| "sea view", "water view", "海景" | `am[]=VW` |
| "maid's room", "保姆房" | `am[]=MR` |
| "security", "保安", "安保" | `am[]=SE` |
| "garden", "花园" | `am[]=PG` |
| "beach access", "海滩" | `am[]=BC` |
| "built-in wardrobe", "衣柜" | `am[]=BW` |

### Sort Synonyms

| User might say | Parameter |
|----------------|-----------|
| "newest", "latest", "最新" | `ob=nd` |
| "cheapest first", "lowest price", "最便宜" | `ob=pa` |
| "most expensive first", "highest price", "最贵" | `ob=pd` |
| "smallest first" | `ob=sa` |
| "largest first", "biggest" | `ob=sd` |

### Commute / Location Examples

| User might say | Parameters |
|----------------|------------|
| "within 30 min drive of Abu Dhabi Mall" | `tt[]=POI_ID,24.4962,54.4085,driving,30,1` |
| "walking distance to work (ADNOC HQ)" | `tt[]=POI_ID,24.4539,54.3773,walking,15,1` |
| "close to both my office and school" | `tt[]=...,driving,30,1&tt[]=...,driving,20,2&tto=intersection` |

Note: POI_ID and coordinates must be resolved from Property Finder's location autocomplete or geocoding.

---

## Example Queries

### "Show me furnished 2-bedroom apartments in Abu Dhabi under 80k yearly"

**Local API:**
```
GET /api/listings?bedrooms=2&furnished=YES&maxPrice=80000
```

**Upstream (Property Finder):**
```
l=6&c=2&t=1&bdr[]=2&fu=1&pt=80000&rp=y&ob=nd
```

### "Find cheapest villas with pool and garden, 3+ bedrooms"

**Upstream:**
```
l=6&c=2&t=35&bdr[]=3&bdr[]=4&bdr[]=5&bdr[]=6&bdr[]=7&bdr[]=8&am[]=SP&am[]=PG&ob=pa
```

### "阿布达比月租单间，5000以下，带家具"

**Upstream:**
```
l=6&c=2&t=1&bdr[]=0&fu=1&pt=5000&rp=m&ob=pa
```

### "Pet-friendly apartments near Corniche with sea view, 1-2 beds"

**Upstream:**
```
l=6&c=2&t=1&bdr[]=1&bdr[]=2&am[]=PA&am[]=VW&ob=nd
```
