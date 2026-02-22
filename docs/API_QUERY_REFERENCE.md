# API Query Parameter Reference

This document is the single source of truth for all query parameters across all layers of the system — the local dashboard API and all three upstream scraper APIs (PropertyFinder, Bayut, Dubizzle). Designed for AI agents to translate natural language into correct API calls.

---

## Platform Comparison

| | PropertyFinder | Bayut | Dubizzle |
|--|----------------|-------|----------|
| **Technique** | Next.js data API (HTTP) | Playwright + SSR extraction | Direct Algolia HTTP API |
| **Anti-bot** | BuildID rotation | Humbucker WAF (`/captchaChallenge`) | Imperva Incapsula (website only; API is open) |
| **Data source** | `_next/data/{BUILD_ID}/en/search.json` | `window.state.algolia.content` | `wd0ptz13zs-dsn.algolia.net` |
| **Browser needed** | No | Yes (Playwright, headed recommended) | No |
| **Speed** | ~1 min | ~2 min (incl. challenge) | ~7 sec |
| **DB collection** | `propertyfinder_raw` | `bayut_raw` | `dubizzle_raw` |
| **Listing ID** | `item.property.id` | `String(item.id)` | `String(item.id)` |
| **Price field** | `property.price.value` | `price` | `price` |
| **Size field** | `property.size.value` | `area` | `size` (sqft) |
| **Pagination** | 1-indexed `?page=N` | 1-indexed `?page=N` | 0-indexed Algolia `page` param |

---

## Quick Start

```bash
# PropertyFinder
npm run scrape:incremental       # incremental (daily)
npm run scrape:full              # full crawl

# Bayut (requires Playwright browser)
npm run scrape:bayut:incremental # incremental
npm run scrape:bayut:full        # full crawl
npm run scrape:bayut:debug       # full crawl, headed mode (visible browser)

# Dubizzle (fastest — pure HTTP)
npm run scrape:dubizzle:incremental  # incremental
npm run scrape:dubizzle:full         # full crawl

# Dashboard
npm run server                   # http://localhost:3000
```

---

## Layer 1: Local Dashboard API (Express)

Base URL: `http://localhost:3000/api`

### GET /api/targeted-results

Curated listings with scoring, commute data, and cost breakdowns.

**Query Parameters:**

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `page` | integer | `1` | Page number (1-indexed) | `page=2` |
| `limit` | integer | `20` | Results per page (max 100) | `limit=50` |
| `sort` | string | `score` | Sort order: `score`, `cost`, `commute`, `newest`, `price`, `price_desc`, `size` | `sort=cost` |
| `neighborhood` | string | — | Filter by neighborhood (English name) | `neighborhood=Al Reem Island` |
| `interest` | string | — | Filter by interaction status: `interested`, `ignored` | `interest=interested` |
| `minScore` | integer | `0` | Minimum overall score | `minScore=40` |
| `minVal` | integer | `0` | Minimum effective cost score | `minVal=30` |
| `minSize` | integer | `0` | Minimum size bonus score | `minSize=5` |
| `maxCommute` | integer | `0` | Maximum commute time in minutes (0 = no filter) | `maxCommute=30` |
| `minPark` | integer | `0` | `1` = has parking only | `minPark=1` |
| `minUtil` | integer | `0` | `1` = utilities included only | `minUtil=1` |
| `minFee` | integer | `0` | `1` = no commission only | `minFee=1` |
| `minPay` | integer | `0` | `1` = flexible payment only | `minPay=1` |
| `minVerified` | integer | `0` | `1` = verified only | `minVerified=1` |
| `minOven` | integer | `0` | `1` = has oven only | `minOven=1` |

**Response:**

```json
{
  "docs": [ ...listing objects... ],
  "total": 178,
  "page": 1,
  "totalPages": 9,
  "neighborhoods": ["Al Reem Island", "Khalifa City A", ...],
  "stats": {
    "medianScore": 70,
    "medianCost": 6184,
    "medianBurden": 21,
    "neighborhoodCount": 16
  }
}
```

| 字段 | 说明 |
|------|------|
| `stats.medianScore` | 筛选结果的匹配分中位数（满分 100） |
| `stats.medianCost` | 月均有效成本中位数（AED，含房租 + 通勤 − 节省） |
| `stats.medianBurden` | 预算占比中位数（百分比） |

每条 listing 的 `title_zh` 字段包含中文翻译标题。

### GET /api/exchange/rate

实时 AED→CNY 汇率（来自 Wise API，1 小时缓存）。

**Response:**

```json
{ "rate": 1.88, "lastUpdated": 1771684113395 }
```

| 字段 | 说明 |
|------|------|
| `rate` | 1 AED 对应的人民币金额 |
| `lastUpdated` | 汇率获取时间（Unix 毫秒时间戳），`null` 表示使用 fallback 值 |

### POST /api/targeted-results/interact

标记房源为感兴趣或忽略。重复发送相同状态会清除（客户端发送 `null`）。

**鉴权：** 需携带有效的 `__session` HttpOnly Cookie（通过 Touch ID 登录获得）。

| Body 字段 | 类型 | 必填 | 说明 |
|-----------|------|------|------|
| `listing_id` | string | 是 | 房源 ID |
| `status` | string/null | 是 | `"interested"`、`"ignored"` 或 `null`（清除） |

**响应：**
```json
{ "success": true, "modifiedCount": 1 }
```

### 认证机制（WebAuthn / Touch ID）

管理员通过 Touch ID 认证，Session 以 HMAC 签名的 HttpOnly Cookie 存储，无数据库参与。

**相关端点：**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/validate` | GET | 检查 `__session` Cookie 是否有效 |
| `/api/webauthn/register-options` | POST | 生成注册选项（需 body 中的 `ADMIN_TOKEN`） |
| `/api/webauthn/register-verify` | POST | 验证注册，返回凭证数据 |
| `/api/webauthn/login-options` | POST | 生成登录 challenge |
| `/api/webauthn/login-verify` | POST | 验证 Touch ID 签名，签发 session cookie（24h） |
| `/api/auth/logout` | POST | 清除 session cookie |

**环境变量：**

| 变量 | 说明 |
|------|------|
| `HMAC_SECRET` | 签名 challenge 和 session（`openssl rand -hex 32`） |
| `ADMIN_TOKEN` | 注册时一次性使用的引导凭证 |
| `WEBAUTHN_RP_ID` | 域名（本地默认 `localhost`，生产设为 Vercel 域名） |
| `WEBAUTHN_CREDENTIAL_ID` | 注册后获得，写入环境变量 |
| `WEBAUTHN_PUBLIC_KEY` | 注册后获得，写入环境变量 |

### GET /api/bedrooms

Bedroom count distribution for charts. When `source=all`, merges counts across all platforms and normalizes "studio" → "0".

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | string | `all` | Data source: `all`, `pf`, `bayut`, `dubizzle` |

**Response:**
```json
[
  { "_id": "0", "count": 272 },
  { "_id": "1", "count": 295 }
]
```
Note: `_id` is the bedroom count as string. `"0"` = Studio. PropertyFinder uses `"studio"` internally but it is normalized to `"0"` when merging across sources.

---

## Automated Pipeline

### pipeline-lite.sh（无人值守定时任务）

轻量级数据管线，跳过 Bayut（需要有头浏览器 + 手动验证码），仅爬取 PropertyFinder 和 Dubizzle。

```bash
bash scripts/pipeline-lite.sh
```

**流程（4 步）：**

| 步骤 | 操作 | 说明 |
|------|------|------|
| Preflight | Node.js 检查、MongoDB 连通性、Git 工作区干净 | 任一失败立即退出 |
| 1/4 | `npm run scrape:incremental` + `scrape:dubizzle:incremental` | 增量爬取 PF + Dubizzle |
| 2/4 | `npm run search:targeted` | 全局重新评分排名 |
| 3/4 | `git pull --rebase` → `npm run export:json` | 先同步远程再导出 |
| 4/4 | `git add` → `git commit` → `git push` | 有变更则推送，Vercel 自动部署 |

**前置条件：**
- Node.js 已安装
- MongoDB 可达（Docker 运行中或远程连接）
- Git 工作区无未提交的非数据文件
- `.env` 包含 `MONGO_URI` 等必要变量

**运行时间：** 约 20–90 秒（取决于增量数据量）

**退出码：** 成功 = 0，任何步骤失败 = 1（`set -euo pipefail`）

详见 [OpenClaw 定时调度文档](OPENCLAW_SETUP.md)。

---

## Layer 2: PropertyFinder Upstream API

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

**IMPORTANT:** Not all property types are valid with all categories (`c`) and cities (`l`). Invalid combinations return HTTP 404. Two layers of restrictions apply:
1. **Category restriction** — Some types are residential-only or commercial-only
2. **City restriction** — Some types don't exist in smaller emirates

| Value | Type | Category Rule | Notes |
|-------|------|--------------|-------|
| `1` | Apartment | Residential only (`c=1,2`) | 404 on all commercial |
| `2` | Villa compound | Universal | Works everywhere |
| `3` | Duplex | Universal | Works everywhere |
| `4` | Short term / daily | Commercial only (`c=3,4`) | 404 on all residential |
| `14` | Land / plot | Universal | Works everywhere |
| `18` | Full floor | Universal | But 404 in many cities |
| `20` | Penthouse | Residential only (`c=1,2`) | 404 on all commercial |
| `21` | Whole building | Commercial only (`c=3,4`) | 404 on all residential |
| `22` | Townhouse | Residential only (`c=1,2`) | 404 on all commercial |
| `35` | Villa | Universal | Works everywhere |
| `45` | Hotel apartment | Mostly universal | 404 on several city+category combos |

#### Full 308-Combo Compatibility Matrix

Tested every combination of 7 cities × 4 categories × 11 types against the live API (Feb 2026). OK = HTTP 200, 404 = route does not exist.

```
City            | Category        | t=1 | t=2 | t=3 | t=4 | t=14| t=18| t=20| t=21| t=22| t=35| t=45
                |                 | Apt | VlCp| Dplx| Shrt| Land| FlFl| Pnth| Bldg| Town| Vila| HtAp
────────────────┼─────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────
Abu Dhabi       | Buy             | OK  | OK  | OK  | 404 | OK  | OK  | OK  | 404 | OK  | OK  | OK
Abu Dhabi       | Rent            | OK  | OK  | OK  | 404 | OK  | OK  | OK  | 404 | OK  | OK  | OK
Abu Dhabi       | Commercial Buy  | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | OK
Abu Dhabi       | Commercial Rent | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404
────────────────┼─────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────
Dubai           | Buy             | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404 | 404 | OK  | 404
Dubai           | Rent            | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404 | 404 | OK  | 404
Dubai           | Commercial Buy  | 404 | OK  | OK  | 404 | OK  | 404 | 404 | 404 | 404 | OK  | 404
Dubai           | Commercial Rent | 404 | OK  | OK  | OK  | OK  | 404 | 404 | OK  | 404 | OK  | 404
────────────────┼─────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────
Sharjah         | Buy             | OK  | OK  | OK  | 404 | OK  | OK  | OK  | 404 | OK  | OK  | OK
Sharjah         | Rent            | OK  | OK  | OK  | 404 | OK  | OK  | OK  | 404 | OK  | OK  | OK
Sharjah         | Commercial Buy  | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404
Sharjah         | Commercial Rent | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404
────────────────┼─────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────
Ajman           | Buy             | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404 | OK  | OK  | OK
Ajman           | Rent            | OK  | OK  | OK  | 404 | OK  | OK  | OK  | 404 | OK  | OK  | OK
Ajman           | Commercial Buy  | 404 | OK  | OK  | 404 | OK  | OK  | 404 | 404 | 404 | OK  | 404
Ajman           | Commercial Rent | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404
────────────────┼─────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────
Umm Al Quwain   | Buy             | OK  | OK  | OK  | 404 | OK  | OK  | OK  | 404 | OK  | OK  | OK
Umm Al Quwain   | Rent            | OK  | OK  | OK  | 404 | OK  | OK  | OK  | 404 | OK  | OK  | 404
Umm Al Quwain   | Commercial Buy  | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404
Umm Al Quwain   | Commercial Rent | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404
────────────────┼─────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────
Ras Al Khaimah  | Buy             | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404 | OK  | OK  | 404
Ras Al Khaimah  | Rent            | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404 | OK  | OK  | OK
Ras Al Khaimah  | Commercial Buy  | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404
Ras Al Khaimah  | Commercial Rent | 404 | OK  | OK  | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404
────────────────┼─────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────
Fujairah        | Buy             | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404 | OK  | OK  | 404
Fujairah        | Rent            | OK  | OK  | OK  | 404 | OK  | 404 | OK  | 404 | OK  | OK  | 404
Fujairah        | Commercial Buy  | 404 | OK  | OK  | 404 | OK  | 404 | 404 | 404 | 404 | OK  | 404
Fujairah        | Commercial Rent | 404 | OK  | OK  | OK  | OK  | 404 | 404 | 404 | 404 | OK  | 404
```

**Why some combos return 404:**
- **Category mismatch**: Apartment/Penthouse/Townhouse are residential-only; Short term/Whole building are commercial-only
- **City market gap**: Smaller emirates (Ajman, Fujairah, UAQ) lack certain property types entirely
- Dubai lacks Full floor, Townhouse, and Hotel apartment across ALL categories

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
| `BR` | Barbecue area |
| `BW` | Built-in wardrobes |
| `CP` | Covered parking |
| `PY` | Private gym |
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
| `SS` | Shared spa |
| `WC` | Walk-in closet |
| `KA` | Kitchen appliances |
| `CS` | Concierge service |
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
| `ba` | Beds: least first |
| `bd` | Beds: most first |

### Keyword Search

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `k` | string | Keyword search (building name, community, area) | `k=Corniche` |

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

## Layer 3: Bayut Upstream API (Scraper)

Bayut uses a custom SSR framework (not Next.js or Nuxt). Search data is server-rendered into a `<script>` tag that populates `window.state.algolia.content`. The scraper uses Playwright to load pages and extract this embedded data. No direct Algolia API access is available — the API key is not exposed client-side.

### Anti-Bot: Humbucker WAF

Bayut is protected by the Humbucker WAF. On first visit (or when sessions expire), the browser is redirected to `/captchaChallenge`.

| Behavior | Details |
|----------|---------|
| Challenge URL | `https://www.bayut.com/captchaChallenge?...` |
| Auto-resolve | ~20 seconds in headed mode (JavaScript challenge) |
| Manual fallback | If auto-resolve fails, 5-minute timeout (`CHALLENGE_WAIT_MS = 300,000`) for manual CAPTCHA |
| Max re-challenges | Configurable via `BAYUT_MAX_RECHALLENGE` (default: `3`) |
| Memory management | Browser context restarts every 50 pages to prevent leaks |

### URL Construction

**Base URL:** `https://www.bayut.com{path}?{query}`

The search path encodes the property type and city:

| Path | Meaning |
|------|---------|
| `/to-rent/apartments/abu-dhabi/` | Apartments for rent in Abu Dhabi |
| `/to-rent/studio-apartments/abu-dhabi/` | Studio apartments (via `beds_in=0` URL rewrite) |
| `/for-sale/villas/dubai/` | Villas for sale in Dubai |

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `beds_in` | integer | Bedroom count. `0` = Studio | `beds_in=1` |
| `price_min` | integer | Minimum price (AED, annual) | `price_min=60000` |
| `price_max` | integer | Maximum price (AED, annual) | `price_max=80000` |
| `page` | integer | Page number (1-indexed; omit for page 1) | `page=3` |

**Note:** When `beds_in=0` (Studio), Bayut rewrites the URL path from `/apartments/` to `/studio-apartments/`. The scraper handles this automatically.

### SSR Data Extraction

After page load, the scraper extracts data from `window.state.algolia.content`:

```javascript
const content = await page.evaluate(() => {
  const c = window.state?.algolia?.content;
  return c ? { hits: c.hits, nbHits: c.nbHits, nbPages: c.nbPages } : null;
});
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `hits` | array | Array of listing objects |
| `nbHits` | integer | Total number of matching listings |
| `nbPages` | integer | Total number of pages |

**Key fields per listing hit:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique listing ID |
| `price` | number | Annual rent price (AED) |
| `area` | number | Size in sqft |
| `bedrooms` | integer | Number of bedrooms (0 = Studio) |
| `bathrooms` | integer | Number of bathrooms |
| `title` | string | Listing title |
| `location` | object | Location hierarchy |

### Bayut Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `BAYUT_SEED_URL` | `https://www.bayut.com/to-rent/apartments/abu-dhabi/` | Initial URL to trigger Humbucker challenge |
| `BAYUT_HEADLESS` | `true` | Run browser in headless mode (`false` for debugging) |
| `BAYUT_PAGE_DELAY_MS` | `5000` | Delay between page fetches (ms) |
| `BAYUT_MAX_RECHALLENGE` | `3` | Max captcha re-challenge attempts before aborting |
| `BAYUT_CIRCUIT_BREAK_THRESHOLD` | `50` | Stop after N consecutive duplicate listings (incremental mode) |
| `BAYUT_MODE` | `incremental` | Scrape mode: `full` or `incremental` |

---

## Layer 4: Dubizzle Upstream API (Scraper)

Dubizzle's frontend is built on Next.js, but the underlying search data comes from Algolia. The scraper calls the Algolia API directly — no browser needed. The Algolia API key is index-restricted (only residential and flatmates indexes are accessible).

### Algolia Endpoint

**Method:** POST
**URL:** `https://wd0ptz13zs-dsn.algolia.net/1/indexes/*/queries`

**Authentication (query parameters):**

| Parameter | Value |
|-----------|-------|
| `x-algolia-api-key` | `cef139620248f1bc328a00fddc7107a6` |
| `x-algolia-application-id` | `WD0PTZ13ZS` |

**Headers:**

| Header | Value |
|--------|-------|
| `content-type` | `application/json` |

### Request Body Structure

```json
{
  "requests": [
    {
      "indexName": "by_verification_feature_asc_property-for-rent-residential.com",
      "params": "page=0&hitsPerPage=50&filters=...&attributesToRetrieve=[...]&attributesToHighlight=[]"
    }
  ]
}
```

The `params` field is a URL-encoded query string with the following keys:

| Key | Type | Description | Example |
|-----|------|-------------|---------|
| `page` | integer | Page number (**0-indexed**) | `0` (first page) |
| `hitsPerPage` | integer | Results per page (max 1000) | `50` |
| `filters` | string | Algolia filter expression (see below) | See Filter Syntax |
| `attributesToRetrieve` | JSON array | Fields to include in response | See Attributes List |
| `attributesToHighlight` | JSON array | Fields to highlight (set to `[]`) | `[]` |

### Filter Syntax

Filters use Algolia's SQL-like syntax. All clauses are joined with `AND`:

```
(city.id=3) AND (categories.ids=24) AND (bedrooms=0) AND (price>=60000) AND (price<=80000)
```

| Filter | Values | Description |
|--------|--------|-------------|
| `city.id` | `2` = Dubai, `3` = Abu Dhabi | City identifier |
| `categories.ids` | `24` = Apartment/Flat | Property category |
| `bedrooms` | `0` = Studio, `1` = 1-Bed, etc. | Bedroom count |
| `price` | integer | Price in AED (supports `>=` and `<=`) |

### Attributes to Retrieve

The full list of fields requested from the Algolia API:

```
id, external_id, uuid, objectID, name, price, payment_frequency,
bedrooms, bathrooms, size, plot_area, furnished, completion_status,
neighborhoods, city, _geoloc, categories,
absolute_url, short_url, photos, photos_count,
agent, agent_profile, listed_by,
property_reference, property_info, building,
is_verified, is_premium_ad, featured_listing,
added, description_short,
has_whatsapp_number, has_video_url, has_tour_url,
amenities_v2
```

**Key fields per listing hit:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique listing ID |
| `price` | number | Annual rent price (AED) |
| `size` | number | Size in sqft |
| `bedrooms` | integer | Number of bedrooms (0 = Studio) |
| `bathrooms` | integer | Number of bathrooms |
| `name` | string | Listing title |
| `neighborhoods` | object | Location/area info |
| `amenities_v2` | array | Amenities list (e.g. `covered_parking`) |
| `furnished` | boolean | Furnished status |

### Response Structure

```json
{
  "results": [
    {
      "hits": [ ...listing objects... ],
      "nbHits": 1234,
      "nbPages": 25,
      "page": 0,
      "hitsPerPage": 50
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `results[0].hits` | array | Array of listing objects |
| `results[0].nbHits` | integer | Total matching listings |
| `results[0].nbPages` | integer | Total pages available |
| `results[0].page` | integer | Current page (0-indexed) |

### Dubizzle Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `DUBIZZLE_PAGE_DELAY_MS` | `1000` | Delay between page fetches (ms) |
| `DUBIZZLE_CIRCUIT_BREAK_THRESHOLD` | `50` | Stop after N consecutive duplicate listings (incremental mode) |
| `DUBIZZLE_MODE` | `incremental` | Scrape mode: `full` or `incremental` |

---

## Natural Language Mapping Guide

This section helps AI agents translate human queries to parameters.

### Location Synonyms

| User might say | PropertyFinder `l` | Dubizzle `city.id` |
|----------------|--------------------|--------------------|
| "Abu Dhabi", "AD", "阿布达比" | `l=6` | `city.id=3` |
| "Dubai", "迪拜" | `l=1` | `city.id=2` |
| "Sharjah", "沙迦" | `l=4` | — |
| "Ras Al Khaimah", "RAK" | `l=3` | — |
| "Ajman", "阿治曼" | `l=2` | — |
| "Fujairah", "富查伊拉" | `l=7` | — |

Note: Bayut uses URL path segments for location (e.g. `/abu-dhabi/`, `/dubai/`).

### Property Type Synonyms

| User might say | PropertyFinder `t` | Dubizzle `categories.ids` |
|----------------|--------------------|----|
| "apartment", "flat", "公寓", "apt" | `t=1` | `24` |
| "villa", "别墅", "独栋" | `t=35` | — |
| "townhouse", "联排", "排屋" | `t=22` | — |
| "penthouse", "顶层", "顶楼" | `t=20` | — |
| "hotel apartment", "酒店式公寓" | `t=45` | — |
| "studio", "单间", "开间" | `t=1` + `bdr[]=0` | `24` + `bedrooms=0` |
| "duplex", "复式" | `t=3` | — |

Note: Bayut uses URL path segments for property type (e.g. `/apartments/`, `/villas/`).

### Bedroom Synonyms

| User might say | PropertyFinder | Bayut | Dubizzle |
|----------------|----------------|-------|----------|
| "studio", "单间", "0 bedroom" | `bdr[]=0` | `beds_in=0` | `bedrooms=0` |
| "1 bed", "一居", "一房" | `bdr[]=1` | `beds_in=1` | `bedrooms=1` |
| "2 bed", "两居", "两房" | `bdr[]=2` | `beds_in=2` | `bedrooms=2` |
| "3 bed", "三居", "三房" | `bdr[]=3` | `beds_in=3` | `bedrooms=3` |
| "1-2 bedrooms" | `bdr[]=1&bdr[]=2` | N/A (single value) | N/A (single value) |

### Price Synonyms

| User might say | PropertyFinder | Bayut | Dubizzle |
|----------------|----------------|-------|----------|
| "under 50k" | `pt=50000` | `price_max=50000` | `price<=50000` |
| "above 80k" | `pf=80000` | `price_min=80000` | `price>=80000` |
| "30k to 60k" | `pf=30000&pt=60000` | `price_min=30000&price_max=60000` | `price>=30000 AND price<=60000` |
| "cheapest first" | `ob=pa` | N/A | N/A |
| "monthly rent" | `rp=m` | N/A (annual only) | N/A (annual only) |

### Furnishing Synonyms

| User might say | Parameter |
|----------------|-----------|
| "furnished", "带家具", "精装" | `fu=1` |
| "unfurnished", "毛坯", "空房" | `fu=2` |
| "partly furnished", "半装修" | `fu=3` |

Note: Furnishing filter is only available on the PropertyFinder upstream API.

### Amenity Synonyms

| User might say | Parameter |
|----------------|-----------|
| "has pool", "swimming pool", "游泳池" | `am[]=SP` (shared) or `am[]=PP` (private) |
| "gym", "fitness", "健身房" | `am[]=SY` (shared) or `am[]=PY` (private) |
| "parking", "停车位", "车位" | `am[]=CP` |
| "balcony", "阳台" | `am[]=BA` |
| "pet friendly", "可养宠物" | `am[]=PA` |
| "sea view", "海景" | `am[]=VW` |
| "maid's room", "保姆房" | `am[]=MR` |
| "security", "保安" | `am[]=SE` |
| "garden", "花园" | `am[]=PG` |
| "beach access", "海滩" | `am[]=BC` |

Note: Amenity filters are only available on the PropertyFinder upstream API. For Dubizzle, parking data is in the `amenities_v2` field (value: `covered_parking`) but cannot be used as a filter.

### Sort Synonyms

| User might say | Parameter |
|----------------|-----------|
| "newest", "latest", "最新" | `ob=nd` |
| "cheapest first", "最便宜" | `ob=pa` |
| "most expensive first", "最贵" | `ob=pd` |
| "fewest bedrooms first" | `ob=ba` |
| "most bedrooms first" | `ob=bd` |

Note: Sorting is only available on the PropertyFinder upstream API.

### Commute / Location Examples

| User might say | Parameters |
|----------------|------------|
| "within 30 min drive of Abu Dhabi Mall" | `tt[]=POI_ID,24.4962,54.4085,driving,30,1` |
| "walking distance to work (ADNOC HQ)" | `tt[]=POI_ID,24.4539,54.3773,walking,15,1` |
| "close to both my office and school" | `tt[]=...,driving,30,1&tt[]=...,driving,20,2&tto=intersection` |

Note: POI_ID and coordinates must be resolved from Property Finder's location autocomplete or geocoding. Commute filters are only available on the PropertyFinder upstream API.

---

## Example Queries

### "Show me furnished 2-bedroom apartments in Abu Dhabi under 80k yearly"

**PropertyFinder upstream:**
```
l=6&c=2&t=1&bdr[]=2&fu=1&pt=80000&rp=y&ob=nd
```

### "Find cheapest villas with pool and garden, 3+ bedrooms"

**PropertyFinder upstream:**
```
l=6&c=2&t=35&bdr[]=3&bdr[]=4&bdr[]=5&bdr[]=6&bdr[]=7&bdr[]=8&am[]=SP&am[]=PG&ob=pa
```

### "Abu Dhabi studio apartments, 60k-80k AED"

**Bayut upstream:**
```
URL: https://www.bayut.com/to-rent/apartments/abu-dhabi/?beds_in=0&price_min=60000&price_max=80000
```

**Dubizzle upstream (Algolia POST body):**
```json
{
  "requests": [{
    "indexName": "by_verification_feature_asc_property-for-rent-residential.com",
    "params": "page=0&hitsPerPage=50&filters=(city.id=3) AND (categories.ids=24) AND (bedrooms=0) AND (price>=60000) AND (price<=80000)&attributesToRetrieve=[\"id\",\"name\",\"price\",\"size\",\"bedrooms\"]&attributesToHighlight=[]"
  }]
}
```

### "阿布达比月租单间，5000以下，带家具"

**PropertyFinder upstream:**
```
l=6&c=2&t=1&bdr[]=0&fu=1&pt=5000&rp=m&ob=pa
```

### "Pet-friendly apartments near Corniche with sea view, 1-2 beds"

**PropertyFinder upstream:**
```
l=6&c=2&t=1&bdr[]=1&bdr[]=2&am[]=PA&am[]=VW&k=Corniche&ob=nd
```
