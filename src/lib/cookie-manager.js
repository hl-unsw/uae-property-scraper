const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

// Rotating user-agent pool — real modern browser UAs
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Create an axios instance with:
 * - Persistent cookie jar (session cookies survive across requests)
 * - Random User-Agent per session
 * - Required headers for Property Finder
 */
function createHttpClient() {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      timeout: 30_000,
      headers: {
        'user-agent': randomUA(),
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        referer: 'https://www.propertyfinder.ae/en/search',
        'x-nextjs-data': '1',
      },
    })
  );

  return client;
}

module.exports = { createHttpClient, randomUA };
