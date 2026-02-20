/**
 * Bayut search URL combination generator.
 *
 * Current scope: Abu Dhabi rent, Apartment type,
 * Studio (beds_in=0) and 1-bed (beds_in=1), 50k-80k AED.
 * Parking preference handled post-crawl (Bayut has no URL param for parking).
 *
 * Neighborhoods filter: 28 Abu Dhabi neighborhoods (22 confirmed from bayut_raw,
 * 6 derived from user target list). Empty results handled gracefully by fetcher.
 */

const NEIGHBORHOODS = [
  // ── Confirmed from bayut_raw location data ──
  { slug: 'al-reem-island',           name: 'Al Reem Island' },
  { slug: 'masdar-city',              name: 'Masdar City' },
  { slug: 'yas-island',               name: 'Yas Island' },
  { slug: 'al-mushrif',               name: 'Al Mushrif' },
  { slug: 'khalifa-city',             name: 'Khalifa City' },
  { slug: 'al-reef',                  name: 'Al Reef' },
  { slug: 'saadiyat-island',          name: 'Saadiyat Island' },
  { slug: 'mohammed-bin-zayed-city',  name: 'MBZ City' },
  { slug: 'al-maryah-island',         name: 'Al Maryah Island' },
  { slug: 'baniyas',                  name: 'Baniyas' },       // includes Bawabat Al Sharq
  { slug: 'al-khalidiyah',            name: 'Al Khalidiyah' },
  { slug: 'al-muntazah',              name: 'Al Muntazah' },
  { slug: 'madinat-al-riyadh',        name: 'Madinat Al Riyadh' },
  { slug: 'zayed-city',               name: 'Zayed City' },
  { slug: 'shahama',                   name: 'Al Shahama' },    // Bayut slug is "shahama"
  { slug: 'al-rahbah',                name: 'Al Rahbah' },
  { slug: 'al-raha-beach',            name: 'Al Raha Beach' }, // covers Al Bandar/Seef/Zeina/Hadeel/Muneera
  { slug: 'shakhbout-city',           name: 'Shakhbout City' },
  { slug: 'rabdan',                    name: 'Rabdan' },
  { slug: 'al-bateen',                name: 'Al Bateen' },
  { slug: 'mussafah',                  name: 'Musaffah' },      // Bayut spelling: mussafah
  { slug: 'rawdhat-abu-dhabi',        name: 'Al Rawdah' },     // confirmed from data
  // ── Derived from user target list (may return 0 results) ──
  { slug: 'al-raha-gardens',          name: 'Al Raha Gardens' },
  { slug: 'al-falah',                 name: 'Al Falah' },
  { slug: 'al-wathba',                name: 'Al Wathba' },
  { slug: 'eastern-mangrove',         name: 'Eastern Mangrove' },
  { slug: 'al-rayyana',               name: 'Al Rayyana' },
  { slug: 'ajban',                     name: 'Ajban' },
];

const BEDROOMS = [
  { beds_in: '0', name: 'Studio' },
  { beds_in: '1', name: '1 Bed' },
];

const PRICE_RANGE = {
  price_min: '50000',
  price_max: '80000',
};

/**
 * Generate search combinations with full URL paths and labels.
 * Each combination = { path, query, label }
 * 28 neighborhoods × 2 bedrooms = 56 combinations.
 */
function generateCombinations() {
  const combos = [];
  for (const hood of NEIGHBORHOODS) {
    for (const bdr of BEDROOMS) {
      combos.push({
        path: `/to-rent/apartments/abu-dhabi/${hood.slug}/`,
        query: {
          ...PRICE_RANGE,
          beds_in: bdr.beds_in,
        },
        label: `Abu Dhabi | ${hood.name} | Rent | Apartment | ${bdr.name} | 50k-80k AED`,
      });
    }
  }
  return combos;
}

module.exports = { generateCombinations };
