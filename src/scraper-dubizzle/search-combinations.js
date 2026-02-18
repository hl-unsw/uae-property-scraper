/**
 * Dubizzle search combination generator.
 *
 * Uses Algolia filter syntax directly.
 * City IDs: Abu Dhabi = 3, Dubai = 2
 * Category IDs: Apartment/Flat = 24
 * Bedrooms: 0 = Studio, 1 = 1-Bed, etc.
 */

const CITY_ID = 3; // Abu Dhabi
const CATEGORY_ID = 24; // Apartment/Flat

const BEDROOMS = [
  { bedrooms: 0, name: 'Studio' },
  { bedrooms: 1, name: '1 Bed' },
];

const PRICE_RANGE = {
  priceMin: 60000,
  priceMax: 80000,
};

/**
 * Generate search combinations for Dubizzle Algolia queries.
 * Each combination = { cityId, categoryId, bedrooms, priceMin, priceMax, label }
 */
function generateCombinations() {
  return BEDROOMS.map((bdr) => ({
    cityId: CITY_ID,
    categoryId: CATEGORY_ID,
    bedrooms: bdr.bedrooms,
    ...PRICE_RANGE,
    label: `Abu Dhabi | Rent | Apartment | ${bdr.name} | 60k-80k AED`,
  }));
}

module.exports = { generateCombinations };
