/**
 * Search combination generator.
 *
 * Generates all filter combinations to crawl. Validates every combo
 * against the full compatibility matrix (308-combo API probe, Feb 2026)
 * to skip known-404 routes before making requests.
 */

// ─── Full Compatibility Matrix ───────────────────────────────────
// Probed all 7 cities × 4 categories × 11 types (308 combos).
// This map lists type IDs that return 404 for each city+category.
//
// City IDs: 1=Dubai, 2=Ajman, 3=Ras Al Khaimah, 4=Sharjah,
//           5=Umm Al Quwain, 6=Abu Dhabi, 7=Fujairah
// Category IDs: 1=Buy, 2=Rent, 3=Commercial Buy, 4=Commercial Rent
// Type IDs: 1=Apartment, 2=Villa Compound, 3=Duplex, 4=Short Term,
//           14=Land, 18=Full Floor, 20=Penthouse, 21=Whole Building,
//           22=Townhouse, 35=Villa, 45=Hotel Apartment

const CITY_CATEGORY_TYPE_UNAVAILABLE = {
  '1': { // Dubai
    '1': ['4', '21'],
    '2': ['4', '21'],
    '3': ['1', '20', '22'],
    '4': ['1', '20', '22', '45'],
  },
  '2': { // Ajman
    '1': ['4', '18', '21', '22', '45'],
    '2': ['4', '18', '21', '22', '45'],
    '3': ['1', '4', '18', '20', '21', '22', '45'],
    '4': ['1', '18', '20', '22', '45'],
  },
  '3': { // Ras Al Khaimah
    '1': ['4', '21'],
    '2': ['4', '21'],
    '3': ['1', '20', '22', '45'],
    '4': ['1', '20', '22', '45'],
  },
  '4': { // Sharjah
    '1': ['4', '18', '21'],
    '2': ['4', '21'],
    '3': ['1', '20', '22', '45'],
    '4': ['1', '20', '22', '45'],
  },
  '5': { // Umm Al Quwain
    '1': ['4', '21'],
    '2': ['4', '21', '45'],
    '3': ['1', '20', '22', '45'],
    '4': ['1', '20', '22', '45'],
  },
  '6': { // Abu Dhabi
    '1': ['4', '18', '21', '45'],
    '2': ['4', '18', '21'],
    '3': ['1', '20', '22', '45'],
    '4': ['1', '20', '22', '45'],
  },
  '7': { // Fujairah
    '1': ['4', '18', '21', '45'],
    '2': ['4', '18', '21', '45'],
    '3': ['1', '4', '18', '20', '21', '22', '45'],
    '4': ['1', '18', '20', '21', '22', '45'],
  },
};

// ─── Current Task: Abu Dhabi Rent — Studio & 1-Bed Apartments ───
// Filters: annual rent 50k-80k AED, area 35-80 sqm (~377-861 sqft),
//          1 bathroom, published since 2026-01-25

const LOCATIONS = [
  { l: '6', name: 'Abu Dhabi' },
];

const CATEGORIES = [
  { c: '2', name: 'Rent' },
];

// Apartment only for this task
const PROPERTY_TYPES = [
  { t: '1', name: 'Apartment' },
];

// Studio and 1 Bedroom only
const BEDROOMS = [
  { 'bdr[]': '0', name: 'Studio' },
  { 'bdr[]': '1', name: '1 Bed' },
];

// Shared filters applied to every combination
const SHARED_FILTERS = {
  rp: 'y',           // Annual rent
  pf: '50000',       // Min price 50,000 AED
  pt: '80000',       // Max price 80,000 AED
  af: '377',         // Min area ~35 sqm (377 sqft)
  at: '861',         // Max area ~80 sqm (861 sqft)
  'btr[]': '1',      // 1 bathroom
};

/**
 * Check if a property type is valid for a given city + category.
 * Based on 308-combo API probe (Feb 2026).
 */
function isValidCombo(cityId, categoryId, typeId) {
  const cityMap = CITY_CATEGORY_TYPE_UNAVAILABLE[cityId];
  if (!cityMap) return true; // Unknown city, assume valid

  const unavailable = cityMap[categoryId];
  if (!unavailable) return true; // Unknown category, assume valid

  return !unavailable.includes(typeId);
}

/**
 * Generate all VALID search parameter combinations.
 * Skips combos known to return 404.
 */
function generateCombinations() {
  const combos = [];

  for (const loc of LOCATIONS) {
    for (const cat of CATEGORIES) {
      for (const pt of PROPERTY_TYPES) {
        if (!isValidCombo(loc.l, cat.c, pt.t)) continue;

        for (const bdr of BEDROOMS) {
          const params = {
            l: loc.l,
            c: cat.c,
            t: pt.t,
            'bdr[]': bdr['bdr[]'],
            ...SHARED_FILTERS,
          };
          const label = `${loc.name} | ${cat.name} | ${pt.name} | ${bdr.name}`;
          combos.push({ params, label });
        }
      }
    }
  }

  return combos;
}

module.exports = {
  generateCombinations,
  isValidCombo,
  CITY_CATEGORY_TYPE_UNAVAILABLE,
};
