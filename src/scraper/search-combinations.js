/**
 * Search combination generator.
 *
 * Generates all filter combinations to crawl. The Cartesian product of
 * locations x property types x bedroom counts gives us fine-grained
 * search slices, each returning a manageable number of pages.
 *
 * This avoids hitting the Property Finder hard limit of ~1000 results
 * per search query by slicing queries narrowly.
 *
 * IMPORTANT: Not all property types are valid for all categories.
 * Invalid combos return 404. See CATEGORY_TYPE_COMPAT below.
 */

// ─── Property Type × Category Compatibility ─────────────────────
// Validated against real API (100-combo test, Feb 2026).
// true = valid, absent = 404.
const CATEGORY_TYPE_COMPAT = {
  '1': ['1', '2', '3', '14', '18', '20', '22', '35', '45'],     // Buy
  '2': ['1', '2', '3', '14', '18', '20', '22', '35', '45'],     // Rent
  '3': ['2', '3', '4', '14', '18', '21', '35', '45'],            // Commercial buy
  '4': ['2', '3', '4', '14', '18', '21', '35'],                  // Commercial rent (no hotel apt)
};

// ─── City × Type availability for Rent (c=2) ────────────────────
// Some types are unavailable in smaller emirates.
const CITY_TYPE_UNAVAILABLE_RENT = {
  '2': ['18', '22', '45'],  // Ajman: no full floor, townhouse, hotel apt
  '5': ['45'],               // UAQ: no hotel apt
  '6': ['18'],               // Abu Dhabi: no full floor for rent
  '7': ['18', '45'],         // Fujairah: no full floor, hotel apt
};

// ─── Dimensions ──────────────────────────────────────────────────

// Abu Dhabi only (l=6). Add more cities as needed.
const LOCATIONS = [
  { l: '6', name: 'Abu Dhabi' },
];

// Rent only (c=2)
const CATEGORIES = [
  { c: '2', name: 'Rent' },
];

// All residential property types valid for rent in Abu Dhabi
const PROPERTY_TYPES = [
  { t: '1', name: 'Apartment' },
  { t: '2', name: 'Villa Compound' },
  { t: '3', name: 'Duplex' },
  { t: '20', name: 'Penthouse' },
  { t: '22', name: 'Townhouse' },
  { t: '35', name: 'Villa' },
  { t: '45', name: 'Hotel Apartment' },
];

// Bedroom filters — Studio through 7+
const BEDROOMS = [
  { 'bdr[]': '0', name: 'Studio' },
  { 'bdr[]': '1', name: '1 Bed' },
  { 'bdr[]': '2', name: '2 Beds' },
  { 'bdr[]': '3', name: '3 Beds' },
  { 'bdr[]': '4', name: '4 Beds' },
  { 'bdr[]': '5', name: '5+ Beds' },
];

/**
 * Check if a property type is valid for a given category and city.
 */
function isValidCombo(cityId, categoryId, typeId) {
  // Check category × type compatibility
  const validTypes = CATEGORY_TYPE_COMPAT[categoryId];
  if (!validTypes || !validTypes.includes(typeId)) {
    return false;
  }

  // Check city-specific restrictions (only for rent)
  if (categoryId === '2') {
    const unavailable = CITY_TYPE_UNAVAILABLE_RENT[cityId] || [];
    if (unavailable.includes(typeId)) {
      return false;
    }
  }

  return true;
}

/**
 * Generate all VALID search parameter combinations.
 * Skips combos known to return 404.
 * Returns an array of { params, label } objects.
 */
function generateCombinations() {
  const combos = [];

  for (const loc of LOCATIONS) {
    for (const cat of CATEGORIES) {
      for (const pt of PROPERTY_TYPES) {
        // Skip invalid type × category × city combos
        if (!isValidCombo(loc.l, cat.c, pt.t)) continue;

        for (const bdr of BEDROOMS) {
          const params = {
            l: loc.l,
            c: cat.c,
            t: pt.t,
            'bdr[]': bdr['bdr[]'],
            rp: 'y', // yearly rent
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
  CATEGORY_TYPE_COMPAT,
  CITY_TYPE_UNAVAILABLE_RENT,
};
