const config = require('../config');
const logger = require('../lib/logger');
const { fetchBuildId } = require('../lib/build-id');
const { acquire } = require('../lib/rate-limiter');

// Global mutable Build ID — refreshed on 404
let currentBuildId = null;

/**
 * Build the full API URL for a given set of query params.
 */
function buildApiUrl(buildId, params, page) {
  const base = config.scraper.apiBase.replace('{BUILD_ID}', buildId);
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    searchParams.append(key, value);
  }
  searchParams.set('page', String(page));

  return `${base}?${searchParams.toString()}`;
}

/**
 * Fetch a single page of search results from the Property Finder API.
 *
 * Auto-healing: If the API returns 404 (Build ID expired), automatically
 * re-fetches the Build ID and retries. Max retries configurable.
 */
async function fetchPage(httpClient, params, page, retries = config.scraper.maxRetries) {
  // Ensure we have a Build ID
  if (!currentBuildId) {
    currentBuildId = await fetchBuildId(httpClient);
  }

  // Acquire rate-limit token + jitter
  await acquire();

  const url = buildApiUrl(currentBuildId, params, page);
  logger.debug({ url, page }, 'Fetching API page');

  try {
    const { data } = await httpClient.get(url);

    // Navigate the Next.js response structure
    const pageProps = data?.pageProps;
    if (!pageProps) {
      logger.warn({ page }, 'Response missing pageProps');
      return null;
    }

    const listings = pageProps.searchResult?.listings || [];
    const meta = pageProps.meta || {};

    return {
      listings,
      meta: {
        page: meta.page || page,
        totalCount: meta.total_count || 0,
        pageCount: meta.page_count || 1,
      },
    };
  } catch (error) {
    const status = error.response?.status;

    // 404 = Build ID expired → auto-heal
    if (status === 404 && retries > 0) {
      logger.warn(
        { retries, oldBuildId: currentBuildId },
        'Build ID expired (404), refreshing...'
      );
      currentBuildId = await fetchBuildId(httpClient);
      return fetchPage(httpClient, params, page, retries - 1);
    }

    // 403 = possible IP ban or WAF block
    if (status === 403) {
      logger.error('Received 403 Forbidden — possible IP block. Pausing 60s...');
      await new Promise((r) => setTimeout(r, 60_000));
      if (retries > 0) {
        return fetchPage(httpClient, params, page, retries - 1);
      }
    }

    // 429 = rate limited
    if (status === 429) {
      logger.warn('Rate limited (429). Backing off 30s...');
      await new Promise((r) => setTimeout(r, 30_000));
      if (retries > 0) {
        return fetchPage(httpClient, params, page, retries - 1);
      }
    }

    logger.error({ err: error.message, status, page }, 'Fetch failed');
    return null;
  }
}

/**
 * Force a Build ID refresh (used during initialization).
 */
async function initBuildId(httpClient) {
  currentBuildId = await fetchBuildId(httpClient);
  return currentBuildId;
}

module.exports = { fetchPage, initBuildId };
