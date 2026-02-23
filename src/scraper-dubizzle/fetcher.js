const axios = require('axios');
const logger = require('../lib/logger');

const ALGOLIA_APP_ID = 'WD0PTZ13ZS';
const ALGOLIA_API_KEY = 'cef139620248f1bc328a00fddc7107a6';
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;
const DEFAULT_INDEX = 'by_verification_feature_asc_property-for-rent-residential.com';

const ATTRIBUTES_TO_RETRIEVE = [
  'id', 'external_id', 'uuid', 'objectID', 'name', 'price', 'payment_frequency',
  'bedrooms', 'bathrooms', 'size', 'plot_area', 'furnished', 'completion_status',
  'neighborhoods', 'city', '_geoloc', 'categories',
  'absolute_url', 'short_url', 'photos', 'photos_count',
  'agent', 'agent_profile', 'listed_by',
  'property_reference', 'property_info', 'building',
  'is_verified', 'is_premium_ad', 'featured_listing',
  'added', 'description_short',
  'has_whatsapp_number', 'has_video_url', 'has_tour_url',
  'amenities_v2',
];

/**
 * Build the Algolia filter string for a search combination.
 */
function buildFilterString(combo) {
  const parts = [`(city.id=${combo.cityId})`, `(categories.ids=${combo.categoryId})`];
  if (combo.bedrooms !== undefined) {
    parts.push(`(bedrooms=${combo.bedrooms})`);
  }
  if (combo.priceMin !== undefined) {
    parts.push(`(price>=${combo.priceMin})`);
  }
  if (combo.priceMax !== undefined) {
    parts.push(`(price<=${combo.priceMax})`);
  }
  return parts.join(' AND ');
}

/**
 * Fetch a single page of Dubizzle listings via Algolia API.
 *
 * @param {object} combo - Search combination from generateCombinations()
 * @param {number} page - Page number (0-indexed)
 * @param {number} hitsPerPage - Results per page (max 1000)
 * @returns {{ hits: object[], nbHits: number, nbPages: number } | null}
 */
async function fetchDubizzlePage(combo, page, hitsPerPage = 50) {
  const filterString = buildFilterString(combo);
  const params = new URLSearchParams({
    page: String(page),
    hitsPerPage: String(hitsPerPage),
    filters: filterString,
    attributesToRetrieve: JSON.stringify(ATTRIBUTES_TO_RETRIEVE),
    attributesToHighlight: '[]',
  });

  const body = {
    requests: [
      {
        indexName: combo.indexName || DEFAULT_INDEX,
        params: params.toString(),
      },
    ],
  };

  try {
    const response = await axios.post(ALGOLIA_URL, body, {
      params: {
        'x-algolia-api-key': ALGOLIA_API_KEY,
        'x-algolia-application-id': ALGOLIA_APP_ID,
      },
      headers: { 'content-type': 'application/json' },
      timeout: 15000,
    });

    const result = response.data?.results?.[0];
    if (!result) {
      logger.warn({ page }, 'No results in Algolia response');
      return null;
    }

    // Validate expected fields — silent fallbacks here caused the PF page-1-only bug
    if (result.hits === undefined || result.nbPages === undefined) {
      logger.warn(
        { page, keys: Object.keys(result).join(',') },
        'Algolia response missing expected fields (hits/nbPages) — API structure may have changed',
      );
    }

    return {
      hits: result.hits || [],
      nbHits: result.nbHits || 0,
      nbPages: result.nbPages || 0,
    };
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.message;
    logger.error({ err: msg, status, page, filter: filterString }, 'Algolia API error');
    return null;
  }
}

module.exports = { fetchDubizzlePage, buildFilterString };
