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
];

// Combined regex for MongoDB $regex queries
const COMBINED_PATTERN = NEIGHBORHOODS.map((n) => n.regex.source).join('|');

// ─── Scoring Regexes ────────────────────────────────────────

const UTILITIES_RE = /bills?.included|utilities?.included|dewa.included|water.*electric.*included/i;
const NO_FEES_RE = /no.commission|no.agent.fee|direct.from.owner|landlord.direct/i;
const FLEX_PAY_RE = /multiple.cheque|[2-9]\+?.cheque|12.cheque|monthly.pay|flexible.pay/i;

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
    },
  },
  dubizzle: {
    collection: 'dubizzle_raw',
    query: {
      price: { $gte: 50000, $lte: 80000 },
      bedrooms: { $in: [0, 1] },
      size: { $gte: 323 },
      'neighborhoods.name.en': { $regex: COMBINED_PATTERN, $options: 'i' },
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

// ─── Scoring ────────────────────────────────────────────────

function scoreParking(source, doc) {
  if (source === 'pf') {
    const amenities = doc.property?.amenities || [];
    if (amenities.some((a) => a === 'CP' || a === 'PA' || a.code === 'CP' || a.code === 'PA')) return 20;
    return 0;
  }
  if (source === 'dubizzle') {
    const amenities = doc.amenities_v2 || [];
    if (amenities.some((a) => a.value === 'covered_parking' || a.slug === 'covered_parking')) return 20;
    return 0;
  }
  // Bayut — limited data, check title
  const title = doc.title || '';
  if (/parking/i.test(title)) return 20;
  return 0;
}

function scoreUtilities(source, doc) {
  const text = getDescriptionText(source, doc);
  return hasPositiveIntent(text, UTILITIES_RE) ? 15 : 0;
}

function scoreFees(source, doc) {
  if (source === 'dubizzle' && doc.listed_by?.value === 'OW') return 10;
  const text = getDescriptionText(source, doc);
  return hasPositiveIntent(text, NO_FEES_RE) ? 10 : 0;
}

function scorePayment(source, doc) {
  const text = getDescriptionText(source, doc);
  return hasPositiveIntent(text, FLEX_PAY_RE) ? 10 : 0;
}

function getDescriptionText(source, doc) {
  if (source === 'pf') return (doc.property?.description || '') + ' ' + (doc.property?.title || '');
  if (source === 'bayut') {
    // Aggregate multiple title fields since full description is missing in list view
    return [doc.title, doc.title_l1, doc.title_l2, doc.title_l3].filter(Boolean).join(' ');
  }
  if (source === 'dubizzle') return (doc.description_short || '') + ' ' + (doc.name?.en || '');
  return '';
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(config.mongo.uri, { maxPoolSize: 5 });
  await client.connect();
  const db = client.db(config.mongo.dbName);
  logger.info('Connected to MongoDB');

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
        // score fields computed below
        score_parking: scoreParking(source, doc),
        score_utilities: scoreUtilities(source, doc),
        score_fees: scoreFees(source, doc),
        score_payment: scorePayment(source, doc),
      });
    }
  }

  logger.info({ total: allListings.length }, 'Total listings after neighborhood filter');

  if (allListings.length === 0) {
    logger.warn('No listings matched — nothing to score');
    await client.close();
    return;
  }

  // 2) Compute value score (price per sqm, lower is better) — 0-30 points
  const priceSqmValues = allListings
    .filter((l) => l.sizeSqm > 0)
    .map((l) => l.price / l.sizeSqm);

  const minPriceSqm = Math.min(...priceSqmValues);
  const maxPriceSqm = Math.max(...priceSqmValues);
  const priceSqmRange = maxPriceSqm - minPriceSqm || 1;

  // 3) Compute size bonus — 0-15 points
  const sizes = allListings.map((l) => l.sizeSqm);
  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);
  const sizeRange = maxSize - minSize || 1;

  // 4) Final scoring
  for (const listing of allListings) {
    // Value score: lower price/sqm = higher score
    const priceSqm = listing.sizeSqm > 0 ? listing.price / listing.sizeSqm : maxPriceSqm;
    listing.score_value = Math.round(((maxPriceSqm - priceSqm) / priceSqmRange) * 30);

    // Size bonus: bigger = better
    listing.score_size_bonus = Math.round(((listing.sizeSqm - minSize) / sizeRange) * 15);

    listing.score = listing.score_parking
      + listing.score_utilities
      + listing.score_fees
      + listing.score_payment
      + listing.score_value
      + listing.score_size_bonus;
  }

  // 5) Sort by score desc, take top 30%
  allListings.sort((a, b) => b.score - a.score);
  const cutoff = Math.max(10, Math.ceil(allListings.length * 0.3));
  const top = allListings.slice(0, cutoff);
  logger.info({ cutoff, topCount: top.length, maxScore: top[0]?.score, minScore: top[top.length - 1]?.score }, 'Top 30% selected');

  // 6) Save to targeted_results
  const targetCol = db.collection('targeted_results');
  await targetCol.deleteMany({}); // clear previous results

  const docs = top.map((l) => ({
    listing_id: l.listing_id,
    source: l.source,
    title: l.title,
    title_zh: l.title, // keep English title — user can read originals
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
    score: l.score,
    score_breakdown: {
      parking: l.score_parking,
      utilities: l.score_utilities,
      fees: l.score_fees,
      payment: l.score_payment,
      value: l.score_value,
      size_bonus: l.score_size_bonus,
    },
    neighborhood_matched: l.neighborhood.en,
    crawled_at: l.crawled_at,
    scored_at: new Date(),
  }));

  if (docs.length > 0) {
    await targetCol.insertMany(docs);
    await targetCol.createIndex({ score: -1 }, { name: 'idx_score_desc' });
    await targetCol.createIndex({ neighborhood_en: 1 }, { name: 'idx_neighborhood' });
  }

  logger.info({ inserted: docs.length }, 'Saved to targeted_results');

  // Summary by neighborhood
  const bySrc = {};
  const byHood = {};
  for (const d of docs) {
    bySrc[d.source] = (bySrc[d.source] || 0) + 1;
    byHood[d.neighborhood_en] = (byHood[d.neighborhood_en] || 0) + 1;
  }
  logger.info({ bySource: bySrc }, 'Results by platform');
  logger.info({ byNeighborhood: byHood }, 'Results by neighborhood');

  await client.close();
  logger.info('Done');
}

main().catch((err) => {
  logger.fatal({ err: err.message }, 'Targeted search failed');
  process.exit(1);
});
