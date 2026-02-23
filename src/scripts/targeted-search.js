#!/usr/bin/env node
/**
 * Targeted 44-Neighborhood Rental Search & Scoring
 *
 * Queries all 3 platform collections, post-filters by neighborhood,
 * scores each listing 0-100, and saves top 30% to targeted_results.
 */

const { MongoClient } = require('mongodb');
const config = require('../config');
const logger = require('../lib/logger');

// ─── Neighborhood Definitions ───────────────────────────────

const NEIGHBORHOODS = [
  // ── Specific Raha sub-communities FIRST (before general Al Raha) ──
  { regex: /raha.garden/i, en: 'Al Raha Gardens', zh: '拉哈花园' },
  { regex: /raha.loft/i, en: 'Al Raha Lofts', zh: '拉哈阁楼' },
  { regex: /raha.beach/i, en: 'Raha Beach', zh: '拉哈海滩' },
  { regex: /al.zeina/i, en: 'Al Zeina', zh: '泽纳' },
  { regex: /al.hadeel/i, en: 'Al Hadeel', zh: '哈迪尔' },
  { regex: /al.bandar/i, en: 'Al Bandar', zh: '班达尔' },
  { regex: /al.seef/i, en: 'Al Seef', zh: '希夫' },
  { regex: /muneera/i, en: 'Al Muneera', zh: '穆尼拉' },
  { regex: /al.raha/i, en: 'Al Rahah', zh: '拉哈' },
  // ── Yas (after Bani Yas to avoid false match) ──
  { regex: /bani.?yas/i, en: 'Baniyas', zh: '巴尼亚斯' },
  { regex: /yas.island|yas.bay|yas.acre|yas.plaza|\byas\b/i, en: 'Yas Island', zh: '亚斯岛' },
  // ── Premium / waterfront areas ──
  { regex: /eastern.mangrove/i, en: 'Eastern Mangrove', zh: '东红树林区' },
  { regex: /qasr.al.shati/i, en: 'Qasr Al Shatie', zh: '卡斯尔·沙提耶' },
  { regex: /muzoun/i, en: 'Al Muzoun', zh: '穆祖恩' },
  { regex: /gurm/i, en: 'Al Gurm West', zh: '古尔姆西区' },
  { regex: /al.reef/i, en: 'Al Reef', zh: '里夫' },
  { regex: /rayyana/i, en: 'Al Rayyana', zh: '雷亚纳' },
  { regex: /saadiyat/i, en: 'Al Saadiyat Island', zh: '萨迪亚特岛' },
  // ── Existing neighborhoods ──
  { regex: /masdar/i, en: 'Masdar City', zh: '马斯达尔城' },
  { regex: /khalifa.city/i, en: 'Khalifa City', zh: '哈利法城' },
  { regex: /zayed.city|madinat.zayed/i, en: 'Zayed City', zh: '扎耶德城' },
  { regex: /mohamed.bin.zayed|mbz.city/i, en: 'MBZ City', zh: '穆罕默德·本·扎耶德城' },
  { regex: /shakhbout/i, en: 'Shakhbout City', zh: '沙赫布特城' },
  { regex: /riyadh/i, en: 'Madinat Al Riyadh', zh: '利雅得城' },
  { regex: /al.falah/i, en: 'Al Falah', zh: '法拉赫' },
  { regex: /shahama/i, en: 'Al Shahama', zh: '沙哈马' },
  { regex: /bah[iy]a/i, en: 'Al Bahyah', zh: '巴希亚' },
  { regex: /rahbah/i, en: 'Al Rahbah', zh: '拉赫巴' },
  { regex: /ajban/i, en: 'Ajban', zh: '阿吉班' },
  { regex: /mus+af+ah/i, en: 'Musaffah', zh: '穆萨法' },
  { regex: /mreikhah/i, en: 'Abu Mreikhah', zh: '阿布·姆雷哈' },
  { regex: /mizn/i, en: 'Al Mizn', zh: '米兹恩' },
  { regex: /haf+ar/i, en: 'Al Haffar', zh: '哈法尔' },
  { regex: /wathba/i, en: 'Al Wathba', zh: '瓦斯巴' },
  { regex: /bihouth/i, en: 'Al Bihouth', zh: '比胡斯' },
  { regex: /mushrif/i, en: 'Mushrif', zh: '穆什里夫' },
  { regex: /rawd[ah]|rawdah/i, en: 'Al Rawdah', zh: '罗达' },
  { regex: /muntazah/i, en: 'Al Muntazah', zh: '蒙塔扎' },
  { regex: /rabdan/i, en: 'Rabdan', zh: '拉卜丹' },
  { regex: /bawabat/i, en: 'Bawabat Al Abu Dhabi', zh: '阿布扎比门' },
  { regex: /nahda|nahdah/i, en: 'Al Nahda East', zh: '纳赫达东区' },
  { regex: /al.reem/i, en: 'Al Reem', zh: '里姆岛' },
  { regex: /bateen/i, en: 'Al Bateen', zh: '巴廷' },
  { regex: /khalidiyah|khalidiya/i, en: 'Al Khalidiyah', zh: '哈利迪亚' },
  { regex: /maryah/i, en: 'Al Maryah Island', zh: '玛丽亚岛' },
];

// Combined regex for MongoDB $regex queries
const COMBINED_PATTERN = NEIGHBORHOODS.map((n) => n.regex.source).join('|');

// ─── Scoring Regexes ────────────────────────────────────────

const UTILITIES_RE = /bills?\s*inclu\w+|utilit\w*\s*inclu\w+|utilit\w*\s*free|free\s*utilit\w*|dewa\s*inclu\w+|free\s*dewa|free\s*addc|addc\s*(inclu\w+|free)|no\s+addc|water.*electri\w*\s*(inclu\w+|free)|electri\w*.*water\s*(inclu\w+|free)|inclu\w+\s*water.*electri|free\s+bills?|0\s+bills?|inclusive\s+of\s+(electri|water)|all\s+bills/i;
const CHILLER_RE = /chiller.?free|free.?chiller|cooling.?free|air.condition\w*\s*\(?free\)?|free.?a\/c/i;
const NO_FEES_RE = /no.commission|no.agent.fee|direct.from.owner|landlord.direct|0\s*%?\s*commission|zero.commission|commission.?free|free.?commission|without.commission|no.broker/i;
const FLEX_PAY_RE = /multiple.cheque|[2-9]\+?.cheque|12.cheque|monthly.pay|flexible.pay/i;
const OVEN_RE = /\boven\b|cooker|kitchen.appliance|kitchen.*(?:equipped|premium\s+appliance|built.in\s+appliance|fitted)/i;

// ─── Score Weights (100 pts total) ──────────────────────────

const SCORE_WEIGHTS = {
  effective_cost: 67, // rent + commute - savings (parking/utilities/commission), per sqm, GLOBAL normalization
  verified: 12,       // platform-verified listing (+2 from oven rebalance)
  size_bonus: 8,      // peak at 50sqm; left-linear, right-plateau
  payment: 6,         // flexible payment terms (multi-cheque / monthly)
  oven: 3,            // has oven / kitchen appliances
  amenities: 4,       // amenities richness (pool, gym, balcony, security)
};

// ─── Staleness Decay (days on market penalty) ────────────────
const STALENESS_DECAY = [
  { days: 90, penalty: -5 },
  { days: 60, penalty: -3 },
  { days: 30, penalty: -2 },
  // 0-30 days: no penalty
];

// ─── Cost Savings (AED/month) ───────────────────────────────

const PARKING_SAVING    = 800;  
const UTILITY_SAVING    = 1000; // 750 (bills) + 250 (convenience/no bureaucracy)
const CHILLER_SAVING    = 450;  // 300 (bills) + 150 (convenience)
const COMMISSION_SAVING = 300;  
  // ~3,500 one-off / 12 months ≈ 292, rounded up

// ─── Size Bonus Constants ───────────────────────────────────
// Left-linear (0→50sqm = 0→8), plateau (50→80sqm = 8), gentle decline (80+sqm)

const IDEAL_SIZE_SQM = 50;

// ─── Commute Data (peak-hour midpoint: min + driving km) ────
// Target: Sky Tower, Al Reem Island
// Source: Google Maps driving times from Sky Tower, Al Reem Island (2026-02-20)
// km: one-way driving distance via fastest route, scaled proportionally

const COMMUTE_DATA = {
  'Al Reem':             { min:  5, km:  2 },  // on-island
  'Al Maryah Island':    { min: 11, km:  4 },  // adjacent island
  'Al Muzoun':           { min: 15, km:  5 },
  'Eastern Mangrove':    { min: 15, km:  6 },
  'Al Muntazah':         { min: 16, km:  8 },
  'Al Seef':             { min: 16, km: 12 },
  'Al Khalidiyah':       { min: 17, km:  8 },  // Corniche route
  'Mushrif':             { min: 17, km:  9 },
  'Al Bateen':           { min: 19, km: 12 },
  'Al Rawdah':           { min: 19, km: 10 },
  'Al Saadiyat Island':  { min: 21, km: 14 },  // via E12 bridge
  'Rabdan':              { min: 22, km: 18 },
  'Al Gurm West':        { min: 23, km: 15 },
  'Al Raha Gardens':     { min: 23, km: 18 },
  'Raha Beach':          { min: 23, km: 17 },
  'Al Raha Lofts':       { min: 23, km: 18 },
  'Al Zeina':            { min: 23, km: 17 },
  'Al Hadeel':           { min: 23, km: 17 },
  'Al Bandar':           { min: 23, km: 17 },
  'Al Muneera':          { min: 23, km: 18 },
  'Al Rahah':            { min: 23, km: 18 },  // general Al Raha area
  'Qasr Al Shatie':      { min: 23, km: 13 },
  'Al Rayyana':          { min: 25, km: 25 },
  'Khalifa City':        { min: 26, km: 22 },
  'MBZ City':            { min: 27, km: 24 },
  'Masdar City':         { min: 28, km: 23 },  // airport road merge
  'Zayed City':          { min: 28, km: 28 },
  'Yas Island':          { min: 30, km: 21 },  // via E12
  'Al Reef':             { min: 31, km: 30 },
  'Shakhbout City':      { min: 33, km: 32 },
  'Bawabat Al Abu Dhabi':{ min: 33, km: 32 },
  'Al Falah':            { min: 35, km: 35 },
  'Al Shahama':          { min: 37, km: 37 },
  'Al Rahbah':           { min: 38, km: 38 },
  'Al Nahda East':       { min: 40, km: 23 },
  'Musaffah':            { min: 40, km: 37 },
  'Madinat Al Riyadh':   { min: 45, km: 45 },
  'Al Haffar':           { min: 48, km: 48 },
  'Abu Mreikhah':        { min: 50, km: 50 },
  'Al Wathba':           { min: 50, km: 51 },
  'Baniyas':             { min: 50, km: 48 },
  'Al Bahyah':           { min: 50, km: 48 },
  'Al Mizn':             { min: 50, km: 50 },
  'Al Bihouth':          { min: 50, km: 50 },
  'Ajban':               { min: 67, km: 69 },
};

// ─── Cost Constants ──────────────────────────────────────────
// Toyota Fortuner 4.0L GXR V6 4x4: 6.8 km/L
// Summer peak fuel price: AED 2.60/L (budget-safe estimate)

const REFERENCE_BUDGET = 30_000;   // AED (Internal reference for ranking)
const WORK_DAYS        = 17.2;     // 365 - 104 - 30(leave) - 25(WFH) = 206 / 12
const HOURS_PER_DAY    = 8;
const FUEL_EFFICIENCY  = 7.5;      // 4.0L V6 single occupant, mostly highway
const FUEL_PRICE       = 2.60;     // AED/L (summer peak)

const COMMUTE_TIME_DISCOUNT = 0.6;  
const PER_MINUTE_VALUE = REFERENCE_BUDGET / (22 * HOURS_PER_DAY * 60) * COMMUTE_TIME_DISCOUNT; // Rate based on standard 22 days, applied to actual 17.2 days
const FUEL_COST_PER_KM = FUEL_PRICE / FUEL_EFFICIENCY;                      // ~0.347 AED/km

/**
 * Calculate monthly commute costs for a neighborhood.
 * Returns { time_cost, fuel_cost, total } in AED/month.
 */
function calcCommuteCost(neighborhoodEn) {
  const d = COMMUTE_DATA[neighborhoodEn];
  if (!d) return { time_cost: 0, fuel_cost: 0, total: 0 };
  const time_cost = d.min * 2 * WORK_DAYS * PER_MINUTE_VALUE;
  const fuel_cost = d.km  * 2 * WORK_DAYS * FUEL_COST_PER_KM;
  return { time_cost: Math.round(time_cost), fuel_cost: Math.round(fuel_cost), total: Math.round(time_cost + fuel_cost) };
}

/**
 * Enhanced semantic check to avoid false positives like "Not direct from owner"
 */
function hasPositiveIntent(text, pattern) {
  if (!text) return false;
  const match = text.match(pattern);
  if (!match) return false;

  // Extract context before the match (approx 3 words or 20 chars)
  const startIndex = Math.max(0, match.index - 25);
  const contextBefore = text.substring(startIndex, match.index).toLowerCase();

  // Negative markers that flip the meaning
  const negations = ['not', 'no', "don't", 'other than', 'instead of', 'excluding', 'but'];
  const hasNegation = negations.some((neg) => {
    const regex = new RegExp(`\\b${neg.replace('.', '\\.')}\\b\\s*$`, 'i');
    return regex.test(contextBefore);
  });

  return !hasNegation;
}

// ─── Source Configurations ──────────────────────────────────

const SOURCES = {
  pf: {
    collection: 'propertyfinder_raw',
    query: {
      'property.price.value': { $gte: 50000, $lte: 80000 },
      'property.bedrooms': { $in: ['studio', '1'] },
      'property.size.value': { $gte: 323 },
      'property.location.full_name': { $regex: COMBINED_PATTERN, $options: 'i' },
      stale_since: null, // exclude stale listings (matches null and missing)
    },
  },
  bayut: {
    collection: 'bayut_raw',
    sizeInSqm: true, // Bayut stores area in sqm, not sqft
    query: {
      price: { $gte: 50000, $lte: 80000 },
      rooms: { $in: [0, 1] },
      area: { $gte: 30 }, // 30 sqm (Bayut area is in sqm)
      'location.name': { $regex: COMBINED_PATTERN, $options: 'i' },
      stale_since: null,
    },
  },
  dubizzle: {
    collection: 'dubizzle_raw',
    query: {
      price: { $gte: 50000, $lte: 80000 },
      bedrooms: { $in: [0, 1] },
      size: { $gte: 323 },
      'neighborhoods.name.en': { $regex: COMBINED_PATTERN, $options: 'i' },
      stale_since: null,
    },
  },
};

// ─── Helpers ────────────────────────────────────────────────

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function matchNeighborhood(source, doc) {
  let text = '';
  if (source === 'pf') {
    text = getPath(doc, 'property.location.full_name') || '';
  } else if (source === 'bayut') {
    text = (Array.isArray(doc.location) ? doc.location.map((l) => l.name).join(' ') : '');
  } else if (source === 'dubizzle') {
    const hoods = doc.neighborhoods?.name?.en;
    text = Array.isArray(hoods) ? hoods.join(' ') : (hoods || '');
  }

  for (const n of NEIGHBORHOODS) {
    if (n.regex.test(text)) return n;
  }
  return null;
}

function getLocationStr(source, doc) {
  if (source === 'pf') return getPath(doc, 'property.location.full_name') || '';
  if (source === 'bayut' && Array.isArray(doc.location)) {
    return doc.location.filter((l) => l.level >= 2).map((l) => l.name).join(', ');
  }
  if (source === 'dubizzle') {
    const parts = [];
    if (doc.building?.name?.en) parts.push(doc.building.name.en);
    const hoods = doc.neighborhoods?.name?.en;
    if (Array.isArray(hoods)) parts.push(...hoods);
    else if (hoods) parts.push(hoods);
    if (doc.city?.name?.en) parts.push(doc.city.name.en);
    return parts.join(', ');
  }
  return '';
}

function getUrl(source, doc) {
  if (source === 'pf') return doc.property?.share_url || '#';
  if (source === 'bayut') return doc.externalID ? `https://www.bayut.com/property/details-${doc.externalID}.html` : '#';
  if (source === 'dubizzle') return doc.absolute_url?.en || doc.short_url || '#';
  return '#';
}

// ─── Detection (boolean) ─────────────────────────────────────

function getDescriptionText(source, doc) {
  if (source === 'pf') return (doc.property?.description || '') + ' ' + (doc.property?.title || '');
  if (source === 'bayut') {
    return [doc.title, doc.title_l1, doc.title_l2, doc.title_l3].filter(Boolean).join(' ');
  }
  if (source === 'dubizzle') return (doc.description_short || '') + ' ' + (doc.name?.en || '');
  return '';
}

function hasParking(source, doc) {
  if (source === 'pf') {
    const codes = doc.property?.amenities || [];
    if (codes.some((a) => a === 'CP' || a.code === 'CP')) return true; // PA = Pets Allowed, not parking
    const names = doc.property?.amenity_names || [];
    if (names.some((n) => /parking/i.test(n))) return true;
    // Fallback: check description text for parking mentions
    return hasPositiveIntent(getDescriptionText(source, doc), /\bparking\b/i);
  }
  if (source === 'dubizzle') {
    const amenities = doc.amenities_v2 || [];
    return amenities.some((a) => /parking/i.test(a.value || ''));
  }
  // Bayut — limited SSR data, check title with negation awareness
  return hasPositiveIntent(doc.title || '', /\bparking\b/i);
}

function hasUtilitiesIncl(source, doc) {
  const text = getDescriptionText(source, doc);
  return hasPositiveIntent(text, UTILITIES_RE);
}

function hasChillerFree(source, doc) {
  const text = getDescriptionText(source, doc);
  return hasPositiveIntent(text, CHILLER_RE);
}

function hasNoCommission(source, doc) {
  if (source === 'dubizzle' && doc.listed_by?.value === 'OW') return true;
  const text = getDescriptionText(source, doc);
  return hasPositiveIntent(text, NO_FEES_RE);
}

function hasOven(source, doc) {
  if (source === 'pf') {
    const codes = doc.property?.amenities || [];
    if (codes.some((a) => a === 'BK' || a.code === 'BK')) return true;
    const names = doc.property?.amenity_names || [];
    if (names.some((n) => /kitchen.appliance/i.test(n))) return true;
    return OVEN_RE.test(getDescriptionText(source, doc));
  }
  if (source === 'dubizzle') {
    const amenities = doc.amenities_v2 || [];
    if (amenities.some((a) => OVEN_RE.test(a.value || ''))) return true;
    return OVEN_RE.test(getDescriptionText(source, doc));
  }
  // Bayut — regex on title fields (low coverage ~9%)
  return OVEN_RE.test(getDescriptionText(source, doc));
}

// ─── Scoring (point-based) ───────────────────────────────────

function scorePayment(source, doc) {
  const text = getDescriptionText(source, doc);
  return hasPositiveIntent(text, FLEX_PAY_RE) ? SCORE_WEIGHTS.payment : 0;
}

function scoreVerified(source, doc) {
  if (source === 'pf') return doc.property?.is_verified ? SCORE_WEIGHTS.verified : 0;
  if (source === 'bayut') return doc.isVerified ? SCORE_WEIGHTS.verified : 0;
  if (source === 'dubizzle') return doc.is_verified ? SCORE_WEIGHTS.verified : 0;
  return 0;
}

function scoreAmenities(source, doc) {
  const found = new Set();
  if (source === 'pf') {
    for (const n of (doc.property?.amenity_names || [])) {
      const lower = n.toLowerCase();
      if (lower.includes('pool')) found.add('pool');
      if (lower.includes('gym')) found.add('gym');
      if (lower.includes('balcon')) found.add('balcony');
      if (lower.includes('security') || lower.includes('cctv')) found.add('security');
    }
  } else if (source === 'dubizzle') {
    for (const a of (doc.amenities_v2 || [])) {
      const v = (a.value || '').toLowerCase();
      if (v.includes('pool')) found.add('pool');
      if (v.includes('gym')) found.add('gym');
      if (v.includes('balcon')) found.add('balcony');
      if (v.includes('security') || v.includes('cctv')) found.add('security');
    }
  } else if (source === 'bayut') {
    const title = (doc.title || '').toLowerCase();
    if (/pool/.test(title)) found.add('pool');
    if (/gym/.test(title)) found.add('gym');
    if (/balcon/.test(title)) found.add('balcony');
  }
  return Math.min(SCORE_WEIGHTS.amenities, Math.round(found.size * (SCORE_WEIGHTS.amenities / 4)));
}

/**
 * Calculate staleness penalty based on days on market.
 * Uses property.listed_date for PF, first_seen_at for others.
 */
function calcStalenessPenalty(source, doc) {
  let listedDate;
  if (source === 'pf') {
    const raw = doc.property?.listed_date;
    listedDate = raw ? new Date(raw) : doc.first_seen_at;
  } else {
    listedDate = doc.first_seen_at;
  }

  if (!listedDate) return STALENESS_DECAY[STALENESS_DECAY.length - 1].penalty; // assume 30+ days

  const daysOnMarket = (Date.now() - new Date(listedDate).getTime()) / (24 * 60 * 60 * 1000);

  for (const tier of STALENESS_DECAY) {
    if (daysOnMarket >= tier.days) return tier.penalty;
  }
  return 0;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(config.mongo.uri, { maxPoolSize: 5 });
  await client.connect();
  const db = client.db(config.mongo.dbName);
  logger.info('Connected to MongoDB');

  // 0) Cleanup stale listings older than 7 days
  for (const [source, cfg] of Object.entries(SOURCES)) {
    const col = db.collection(cfg.collection);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await col.deleteMany({ stale_since: { $lte: cutoff } });
    if (result.deletedCount > 0) {
      logger.info({ source, deleted: result.deletedCount }, 'Cleaned up stale listings (> 7 days)');
    }
  }

  // 1) Query all 3 sources
  const allListings = [];

  for (const [source, cfg] of Object.entries(SOURCES)) {
    const col = db.collection(cfg.collection);
    const docs = await col.find(cfg.query).toArray();
    logger.info({ source, count: docs.length }, 'Queried source');

    for (const doc of docs) {
      const hood = matchNeighborhood(source, doc);
      if (!hood) continue; // double-check neighborhood match

      const price = source === 'pf'
        ? Number(getPath(doc, 'property.price.value')) || 0
        : Number(doc.price) || 0;

      const rawSize = source === 'pf'
        ? Number(getPath(doc, 'property.size.value')) || 0
        : source === 'bayut'
          ? Number(doc.area) || 0
          : Number(doc.size) || 0;

      // Bayut area is in sqm; PF and Dubizzle are in sqft
      const sizeSqm = cfg.sizeInSqm ? Math.round(rawSize) : Math.round(rawSize * 0.092903);
      const sizeSqft = cfg.sizeInSqm ? Math.round(rawSize / 0.092903) : rawSize;

      const rawBeds = source === 'pf'
        ? getPath(doc, 'property.bedrooms')
        : source === 'bayut'
          ? doc.rooms
          : doc.bedrooms;

      const bedrooms = String(rawBeds ?? '');

      let furnished = source === 'pf'
        ? doc.property?.furnished || ''
        : source === 'bayut'
          ? doc.furnishingStatus || ''
          : '';
      if (source === 'dubizzle') furnished = doc.furnished ? 'YES' : 'NO';

      const title = source === 'pf'
        ? getPath(doc, 'property.title') || ''
        : source === 'bayut'
          ? doc.title || ''
          : doc.name?.en || '';

      const commuteInfo = COMMUTE_DATA[hood.en] || { min: null, km: null };
      const commuteCost = calcCommuteCost(hood.en);
      const monthlyRent = Math.round(price / 12);

      // Boolean detections
      const parking = hasParking(source, doc);
      const utilitiesIncl = hasUtilitiesIncl(source, doc);
      const chillerFree = !utilitiesIncl && hasChillerFree(source, doc);
      const noCommission = hasNoCommission(source, doc);
      const oven = hasOven(source, doc);

      // Cost savings
      const parkingSaving = parking ? PARKING_SAVING : 0;
      const utilitySaving = utilitiesIncl ? UTILITY_SAVING : chillerFree ? CHILLER_SAVING : 0;
      const commissionSaving = noCommission ? COMMISSION_SAVING : 0;

      const effectiveMonthlyCost = monthlyRent + commuteCost.total
        - parkingSaving - utilitySaving - commissionSaving;

      allListings.push({
        _raw: doc,
        source,
        listing_id: doc.listing_id,
        title,
        price,
        sizeSqft,
        sizeSqm,
        bedrooms,
        furnished,
        location: getLocationStr(source, doc),
        url: getUrl(source, doc),
        neighborhood: hood,
        crawled_at: doc.crawled_at,
        // Cost fields
        commute_min: commuteInfo.min,
        commute_km: commuteInfo.km,
        monthly_rent: monthlyRent,
        monthly_time_cost: commuteCost.time_cost,
        monthly_fuel_cost: commuteCost.fuel_cost,
        monthly_commute_cost: commuteCost.total,
        effective_monthly_cost: effectiveMonthlyCost,
        burden_index: Math.round((effectiveMonthlyCost / REFERENCE_BUDGET) * 100),
        // Boolean flags
        has_parking: parking,
        has_utilities: utilitiesIncl,
        has_chiller_free: chillerFree,
        has_no_commission: noCommission,
        has_oven: oven,
        // Savings breakdown (AED/month)
        monthly_parking_saving: parkingSaving,
        monthly_utility_saving: utilitySaving,
        monthly_commission_saving: commissionSaving,
        // Score fields computed below
        score_payment: scorePayment(source, doc),
        score_verified: scoreVerified(source, doc),
        score_amenities: scoreAmenities(source, doc),
        staleness_penalty: calcStalenessPenalty(source, doc),
      });
    }
  }

  logger.info({ total: allListings.length }, 'Total listings after neighborhood filter');

  if (allListings.length === 0) {
    logger.warn('No listings matched — nothing to score');
    await client.close();
    return;
  }

  // 2) Effective-cost scoring (GLOBAL) — lower cost/sqm = higher score
  //    Savings from parking/utilities/commission are already subtracted from effective_monthly_cost.
  //    P5/P95 percentile capping to prevent outliers from compressing the score range.

  const rawCostPerSqm = allListings.filter((l) => l.sizeSqm > 0)
    .map((l) => l.effective_monthly_cost / l.sizeSqm);
  const sortedCosts = [...rawCostPerSqm].sort((a, b) => a - b);
  const p5  = sortedCosts[Math.floor(sortedCosts.length * 0.05)] || 0;
  const p95 = sortedCosts[Math.floor(sortedCosts.length * 0.95)] || 1;
  const globalMinCost = p5;
  const globalMaxCost = p95;
  const globalCostRange = globalMaxCost - globalMinCost || 1;

  // 3) Score each listing
  for (const listing of allListings) {
    // Effective cost: GLOBAL normalization with P5/P95 capping
    const rawCpSqm = listing.sizeSqm > 0
      ? listing.effective_monthly_cost / listing.sizeSqm : p95;
    const costPerSqm = Math.max(p5, Math.min(p95, rawCpSqm));
    listing.score_effective_cost = Math.round(
      ((globalMaxCost - costPerSqm) / globalCostRange) * SCORE_WEIGHTS.effective_cost);

    // Size bonus: left-linear (0→50sqm), plateau (50→80sqm), gentle decline (80+sqm)
    const sqm = listing.sizeSqm;
    listing.score_size_bonus = sqm <= IDEAL_SIZE_SQM
      ? Math.round((sqm / IDEAL_SIZE_SQM) * SCORE_WEIGHTS.size_bonus)
      : sqm <= 80
        ? SCORE_WEIGHTS.size_bonus
        : Math.max(Math.round(SCORE_WEIGHTS.size_bonus / 2),
            Math.round((1 - (sqm - 80) / 120) * SCORE_WEIGHTS.size_bonus));

    // Oven
    listing.score_oven = listing.has_oven ? SCORE_WEIGHTS.oven : 0;

    listing.score = listing.score_effective_cost
      + listing.score_verified
      + listing.score_size_bonus
      + listing.score_payment
      + listing.score_oven
      + listing.score_amenities
      + listing.staleness_penalty;
  }

  // 5) Sort by score desc, take top 30%
  allListings.sort((a, b) => b.score - a.score);
  const cutoff = Math.max(10, Math.ceil(allListings.length * 0.3));
  const top = allListings.slice(0, cutoff);
  logger.info({ cutoff, topCount: top.length, maxScore: top[0]?.score, minScore: top[top.length - 1]?.score }, 'Top 30% selected');

  // 6) Save to targeted_results
  const targetCol = db.collection('targeted_results');
  
  // Backup existing interest statuses
  const existingInterests = await targetCol.find({}, { projection: { listing_id: 1, interest: 1 } }).toArray();
  const interestMap = {};
  existingInterests.forEach(item => {
    if (item.interest) interestMap[item.listing_id] = item.interest;
  });

  await targetCol.deleteMany({}); // clear previous results

  const docs = top.map((l) => ({
    listing_id: l.listing_id,
    source: l.source,
    title: l.title,
    title_zh: l.title,
    price: l.price,
    size_sqm: l.sizeSqm,
    size_sqft: l.sizeSqft,
    bedrooms: l.bedrooms,
    furnished: l.furnished,
    location: l.location,
    location_zh: l.neighborhood.zh,
    neighborhood_en: l.neighborhood.en,
    neighborhood_zh: l.neighborhood.zh,
    url: l.url,
    // Commute & cost
    commute_min: l.commute_min,
    commute_km: l.commute_km,
    monthly_rent: l.monthly_rent,
    monthly_time_cost: l.monthly_time_cost,
    monthly_fuel_cost: l.monthly_fuel_cost,
    monthly_commute_cost: l.monthly_commute_cost,
    effective_monthly_cost: l.effective_monthly_cost,
    burden_index: l.burden_index,
    // Boolean flags
    has_parking: l.has_parking,
    has_utilities: l.has_utilities,
    has_chiller_free: l.has_chiller_free,
    has_no_commission: l.has_no_commission,
    has_oven: l.has_oven,
    // Savings breakdown (AED/month)
    monthly_parking_saving: l.monthly_parking_saving,
    monthly_utility_saving: l.monthly_utility_saving,
    monthly_commission_saving: l.monthly_commission_saving,
    // Interest preservation
    interest: interestMap[l.listing_id] || null,
    // Scoring
    score: l.score,
    score_breakdown: {
      effective_cost: l.score_effective_cost,
      verified: l.score_verified,
      size_bonus: l.score_size_bonus,
      payment: l.score_payment,
      oven: l.score_oven,
      amenities: l.score_amenities,
      staleness: l.staleness_penalty,
    },
    neighborhood_matched: l.neighborhood.en,
    crawled_at: l.crawled_at,
    scored_at: new Date(),
  }));

  if (docs.length > 0) {
    await targetCol.insertMany(docs);
    await targetCol.createIndex({ score: -1 }, { name: 'idx_score_desc' });
    await targetCol.createIndex({ effective_monthly_cost: 1 }, { name: 'idx_effective_cost' });
    await targetCol.createIndex({ neighborhood_en: 1 }, { name: 'idx_neighborhood' });
  }

  logger.info({ inserted: docs.length }, 'Saved to targeted_results');

  // Summary by neighborhood
  const bySrc = {};
  const hoodCounts = {};
  for (const d of docs) {
    bySrc[d.source] = (bySrc[d.source] || 0) + 1;
    hoodCounts[d.neighborhood_en] = (hoodCounts[d.neighborhood_en] || 0) + 1;
  }
  logger.info({ bySource: bySrc }, 'Results by platform');
  logger.info({ byNeighborhood: hoodCounts }, 'Results by neighborhood');

  await client.close();
  logger.info('Done');
}

// Only run main() when executed directly (not when required for testing)
if (require.main === module) {
  main().catch((err) => {
    logger.fatal({ err: err.message }, 'Targeted search failed');
    process.exit(1);
  });
}

// Export for testing
module.exports = { calcStalenessPenalty, STALENESS_DECAY, SOURCES };
