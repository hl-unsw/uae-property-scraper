const cheerio = require('cheerio');
const { chromium } = require('playwright');
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
 *
 * Falls back to Playwright if the HTTP request hits an AWS WAF challenge.
 */
async function fetchBuildId(httpClient) {
  const url = config.scraper.searchPageUrl;
  logger.info({ url }, 'Fetching Build ID from search page');

  // Try plain HTTP first (faster)
  const { data: html } = await httpClient.get(url, {
    headers: { accept: 'text/html' },
  });

  const $ = cheerio.load(html);
  const nextDataScript = $('#__NEXT_DATA__').html();

  if (nextDataScript) {
    const nextData = JSON.parse(nextDataScript);
    const buildId = nextData.buildId;
    if (buildId) {
      logger.info({ buildId }, 'Build ID acquired via HTTP');
      return buildId;
    }
  }

  // HTTP response was a WAF challenge page — use Playwright
  logger.warn('HTTP fetch got WAF challenge, falling back to Playwright');
  return fetchBuildIdWithBrowser(url);
}

async function fetchBuildIdWithBrowser(url) {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'Asia/Dubai',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Wait for __NEXT_DATA__ to appear (WAF challenge resolves first)
    // Script tags are hidden, so use 'attached' instead of default 'visible'
    await page.waitForSelector('#__NEXT_DATA__', { state: 'attached', timeout: 120_000 });

    // Poll until __NEXT_DATA__ parses and exposes a buildId. WAF challenge
    // pages can ship a partial/stub __NEXT_DATA__ before the real search
    // bundle swaps in, which otherwise causes truncated-JSON parse errors.
    const buildId = await page.waitForFunction(
      () => {
        const el = document.getElementById('__NEXT_DATA__');
        if (!el || !el.textContent) return null;
        try {
          const data = JSON.parse(el.textContent);
          return data.buildId || null;
        } catch {
          return null;
        }
      },
      null,
      { timeout: 120_000, polling: 500 }
    ).then((handle) => handle.jsonValue());

    if (!buildId) {
      throw new Error('buildId not found in __NEXT_DATA__ JSON (Playwright)');
    }

    logger.info({ buildId }, 'Build ID acquired via Playwright');
    return buildId;
  } finally {
    await browser.close();
  }
}

module.exports = { fetchBuildId };
