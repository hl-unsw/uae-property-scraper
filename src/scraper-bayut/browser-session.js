const { chromium } = require('playwright');
const config = require('../config');
const logger = require('../lib/logger');

const CHALLENGE_PATH = '/captchaChallenge';
const CHALLENGE_WAIT_MS = 300_000; // 5 min for manual captcha in headed mode
const NAV_TIMEOUT_MS = 30_000;

class BayutBrowserSession {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.challengeCount = 0;
    this.pagesSinceRestart = 0;
  }

  async launch() {
    this.browser = await chromium.launch({
      headless: config.bayut.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });

    await this._createContext();
    logger.info({ headless: config.bayut.headless }, 'Bayut browser launched');
  }

  async _createContext() {
    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'Asia/Dubai',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    this.page = await this.context.newPage();

    // Remove webdriver flag
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    this.pagesSinceRestart = 0;
  }

  /**
   * Navigate to seed URL and wait for Humbucker challenge to resolve.
   * Returns true if the challenge was passed successfully.
   */
  async passChallenge() {
    logger.info('Navigating to seed URL for Humbucker challenge...');

    await this.page.goto(config.bayut.seedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    });

    // Check if redirected to captcha challenge
    if (this.page.url().includes(CHALLENGE_PATH)) {
      logger.warn('Redirected to captcha challenge, waiting for auto-resolve...');
      try {
        await this.page.waitForURL((url) => !url.toString().includes(CHALLENGE_PATH), {
          timeout: CHALLENGE_WAIT_MS,
        });
        logger.info('Humbucker challenge passed automatically');
      } catch {
        logger.error('Humbucker challenge did NOT auto-resolve within timeout');
        return false;
      }
    }

    // Wait for page to fully load after challenge
    await this.page.waitForLoadState('networkidle').catch(() => {});
    this.challengeCount = 0;
    logger.info({ url: this.page.url() }, 'Session established');
    return true;
  }

  /**
   * Ensure session is still valid. Re-challenge if needed.
   */
  async ensureSession() {
    if (this.challengeCount >= config.bayut.maxReChallenge) {
      throw new Error(`Max re-challenge attempts (${config.bayut.maxReChallenge}) exceeded`);
    }
    this.challengeCount++;
    logger.warn({ attempt: this.challengeCount }, 'Re-challenging Humbucker...');
    return this.passChallenge();
  }

  /**
   * Navigate to a URL with timeout handling.
   */
  async navigateTo(url) {
    this.pagesSinceRestart++;

    // Restart browser context every 50 pages to prevent memory leaks
    if (this.pagesSinceRestart >= 50) {
      logger.info('Restarting browser context (memory management)');
      await this.context.close();
      await this._createContext();
      await this.passChallenge();
    }

    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      logger.info('Bayut browser closed');
    }
  }
}

module.exports = BayutBrowserSession;
