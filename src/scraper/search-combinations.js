/**
 * Search combination generator.
 *
 * Generates all filter combinations to crawl. The Cartesian product of
 * locations x property types x bedroom counts gives us fine-grained
 * search slices, each returning a manageable number of pages.
 *
 * This avoids hitting the Property Finder hard limit of ~1000 results
 * per search query by slicing queries narrowly.
 */

// Abu Dhabi only (l=6). Add more cities as needed.
const LOCATIONS = [
  { l: '6', name: 'Abu Dhabi' },
];

// Rent only (c=2)
const CATEGORIES = [
  { c: '2', name: 'Rent' },
];

// Main residential property types
const PROPERTY_TYPES = [
  { t: '1', name: 'Apartment' },
  { t: '35', name: 'Villa' },
  { t: '22', name: 'Townhouse' },
  { t: '20', name: 'Penthouse' },
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
 * Generate all search parameter combinations.
 * Returns an array of { params, label } objects.
 */
function generateCombinations() {
  const combos = [];

  for (const loc of LOCATIONS) {
    for (const cat of CATEGORIES) {
      for (const pt of PROPERTY_TYPES) {
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

module.exports = { generateCombinations };
