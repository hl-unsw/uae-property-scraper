#!/usr/bin/env node
/**
 * Post-processing: date filter, validation, and export.
 *
 * Usage: node scripts/post-process.js
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGO_DB_NAME || 'uae_real_estate';
const COLLECTION = 'propertyfinder_raw';
const DATE_CUTOFF = '2026-01-25T00:00:00Z';
const EXPORT_PATH = path.join(__dirname, '..', 'data', 'abu-dhabi-rent-2026.json');

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const col = db.collection(COLLECTION);

  // ── Phase 1: Date filter ──
  console.log('=== PHASE 1: Date Filter ===');
  const beforeCount = await col.countDocuments();
  console.log('Before filter:', beforeCount, 'listings');

  const deleteResult = await col.deleteMany({
    'property.listed_date': { $lt: DATE_CUTOFF },
  });
  const afterCount = await col.countDocuments();
  console.log('Deleted:', deleteResult.deletedCount, '(listed before', DATE_CUTOFF + ')');
  console.log('After filter:', afterCount, 'listings');

  // ── Phase 2: Validation — 10 random samples ──
  console.log('\n=== PHASE 2: Validation (10 random samples) ===');
  const samples = await col.aggregate([{ $sample: { size: 10 } }]).toArray();

  let pass = 0;
  let fail = 0;
  const errors = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const p = s.property || {};
    const checks = [];

    // Check 1: Has listing_id
    if (!s.listing_id) checks.push('MISSING listing_id');

    // Check 2: Price in range 50000-80000
    const price = p.price?.value;
    if (!price || price < 50000 || price > 80000) checks.push('PRICE OUT OF RANGE: ' + price);

    // Check 3: Bedrooms is studio or 1
    const beds = String(p.bedrooms);
    if (beds !== '0' && beds !== '1' && beds !== 'studio') checks.push('WRONG BEDROOMS: ' + beds);

    // Check 4: Has title
    if (!p.title) checks.push('MISSING title');

    // Check 5: City is Abu Dhabi
    const loc = (p.location?.full_name || '').toLowerCase();
    if (!loc.includes('abu dhabi')) checks.push('WRONG CITY: ' + p.location?.full_name);

    // Check 6: Area in range (allow tolerance: 350-900 sqft)
    const area = p.size?.value;
    if (area && (area < 350 || area > 900)) checks.push('AREA OUT OF RANGE: ' + area);

    // Check 7: Listed date >= cutoff
    if (p.listed_date && p.listed_date < DATE_CUTOFF) checks.push('DATE TOO OLD: ' + p.listed_date);

    // Check 8: Bathrooms is 1
    const baths = p.bathrooms;
    if (baths !== 1 && baths !== '1') checks.push('WRONG BATHROOMS: ' + baths);

    if (checks.length === 0) {
      pass++;
      console.log(`  [PASS] #${i + 1} ID=${s.listing_id} | ${p.title?.substring(0, 50)} | ${price} AED | ${beds} bed | ${area || '?'} sqft | ${p.listed_date?.substring(0, 10)}`);
    } else {
      fail++;
      errors.push({ id: s.listing_id, checks });
      console.log(`  [FAIL] #${i + 1} ID=${s.listing_id} | ${checks.join('; ')}`);
    }
  }

  console.log(`\nValidation: ${pass}/10 PASS, ${fail}/10 FAIL`);
  if (fail > 0) {
    console.log('ERRORS:');
    errors.forEach((e) => console.log('  ID ' + e.id + ': ' + e.checks.join('; ')));
  }

  // Abort export if >30% fail
  if (fail > 3) {
    console.error('\nTOO MANY FAILURES. Aborting export.');
    await client.close();
    process.exit(1);
  }

  // ── Phase 3: Export ──
  console.log('\n=== PHASE 3: Export ===');
  const allDocs = await col.find({}).toArray();

  // Remove MongoDB internal _id for cleaner export
  const cleaned = allDocs.map((doc) => {
    const { _id, ...rest } = doc;
    return rest;
  });

  const dir = path.dirname(EXPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(EXPORT_PATH, JSON.stringify(cleaned, null, 2));
  const stats = fs.statSync(EXPORT_PATH);
  console.log(`Exported ${cleaned.length} listings to ${EXPORT_PATH}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);

  // Quick stats
  const prices = cleaned.map((d) => d.property?.price?.value).filter(Boolean);
  const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const studios = cleaned.filter((d) => d.property?.bedrooms === 'studio' || d.property?.bedrooms === '0').length;
  const oneBed = cleaned.filter((d) => d.property?.bedrooms === '1' || d.property?.bedrooms === 1).length;
  console.log(`\nSummary: ${studios} studios, ${oneBed} one-beds | Avg price: ${avgPrice} AED`);

  await client.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
