const cheerio = require('cheerio');
const config = require('../config');
const logger = require('./logger');

/**
 * Fetch the current Build ID from the Property Finder SEARCH page.
 *
 * CRITICAL: Must request /en/search (the search Next.js app),
 * NOT the homepage (which is a different Next.js app with a different buildId).
 *
 * The search app uses basePath: "/search", so its _next/data routes
 * live under /search/_next/data/{buildId}/...
 */
async function fetchBuildId(httpClient) {
  const url = config.scraper.searchPageUrl;
  logger.info({ url }, 'Fetching Build ID from search page');

  const { data: html } = await httpClient.get(url, {
    headers: { accept: 'text/html' },
  });

  const $ = cheerio.load(html);
  const nextDataScript = $('#__NEXT_DATA__').html();

  if (!nextDataScript) {
    throw new Error(
      'Could not find __NEXT_DATA__ script tag — page structure may have changed'
    );
  }

  const nextData = JSON.parse(nextDataScript);
  const buildId = nextData.buildId;

  if (!buildId) {
    throw new Error('buildId not found in __NEXT_DATA__ JSON');
  }

  logger.info({ buildId }, 'Build ID acquired');
  return buildId;
}

module.exports = { fetchBuildId };
