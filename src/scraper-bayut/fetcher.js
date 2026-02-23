const logger = require('../lib/logger');

const STATE_EXTRACT_TIMEOUT_MS = 15_000;

/**
 * Build the full Bayut search URL for a given combination and page.
 */
function buildSearchUrl(combo, page) {
  const url = new URL(`https://www.bayut.com${combo.path}`);
  for (const [key, value] of Object.entries(combo.query)) {
    url.searchParams.set(key, value);
  }
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

/**
 * Fetch a single page of Bayut search results by extracting SSR-embedded
 * window.state.algolia.content from the rendered page.
 *
 * Bayut server-side renders search data into a <script> tag that populates
 * window.state. No client-side Algolia API calls are made.
 *
 * @param {import('./browser-session')} session - Active browser session
 * @param {object} combo - Search combination from generateCombinations()
 * @param {number} page - Page number (1-indexed)
 * @returns {{ hits: object[], nbHits: number, nbPages: number } | null}
 */
async function fetchBayutPage(session, combo, page) {
  const searchUrl = buildSearchUrl(combo, page);
  logger.debug({ url: searchUrl, page }, 'Navigating to Bayut search page');

  try {
    await session.navigateTo(searchUrl);

    // Check if redirected to captcha challenge
    if (session.page.url().includes('/captchaChallenge')) {
      logger.warn('Session expired — captcha challenge detected during fetch');
      const passed = await session.ensureSession();
      if (!passed) return null;
      // Retry this page after re-challenge
      return fetchBayutPage(session, combo, page);
    }

    // Wait for window.state to be populated by SSR script
    await session.page.waitForFunction(
      () => window.state?.algolia?.content?.hits?.length > 0,
      { timeout: STATE_EXTRACT_TIMEOUT_MS },
    ).catch(() => {});

    // Extract raw data from SSR-embedded window.state (no fallbacks inside evaluate)
    const raw = await session.page.evaluate(() => {
      const c = window.state?.algolia?.content;
      if (!c) return null;
      return { hits: c.hits, nbHits: c.nbHits, nbPages: c.nbPages };
    });

    if (!raw || !Array.isArray(raw.hits) || raw.hits.length === 0) {
      logger.warn({ page, url: searchUrl }, 'No listing data found in window.state');
      return null;
    }

    // Validate expected fields — silent fallbacks here caused the PF page-1-only bug
    if (raw.nbPages === undefined || raw.nbHits === undefined) {
      logger.warn(
        { page },
        'Bayut SSR state missing nbPages/nbHits — page structure may have changed',
      );
    }

    const content = {
      hits: raw.hits,
      nbHits: raw.nbHits || 0,
      nbPages: raw.nbPages || 0,
    };

    logger.debug(
      { page, hits: content.hits.length, nbHits: content.nbHits, nbPages: content.nbPages },
      'Extracted listings from SSR state',
    );

    return content;
  } catch (error) {
    logger.error({ err: error.message, page }, 'fetchBayutPage error');
    return null;
  }
}

module.exports = { fetchBayutPage, buildSearchUrl };
