/**
 * Bayut search URL combination generator.
 *
 * Current scope: Abu Dhabi rent, Apartment type,
 * Studio (beds_in=0) and 1-bed (beds_in=1), 60k-80k AED.
 * Parking preference handled post-crawl (Bayut has no URL param for parking).
 */

const BASE_PATH = '/to-rent/apartments/abu-dhabi/';

const BEDROOMS = [
  { beds_in: '0', name: 'Studio' },
  { beds_in: '1', name: '1 Bed' },
];

const PRICE_RANGE = {
  price_min: '60000',
  price_max: '80000',
};

/**
 * Generate search combinations with full URL paths and labels.
 * Each combination = { path, query, label }
 */
function generateCombinations() {
  return BEDROOMS.map((bdr) => ({
    path: BASE_PATH,
    query: {
      ...PRICE_RANGE,
      beds_in: bdr.beds_in,
    },
    label: `Abu Dhabi | Rent | Apartment | ${bdr.name} | 60k-80k AED`,
  }));
}

module.exports = { generateCombinations };
