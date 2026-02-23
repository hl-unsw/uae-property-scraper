/**
 * Tests for staleness decay scoring and stale filtering in targeted-search.js
 */

const { calcStalenessPenalty, STALENESS_DECAY, SOURCES } = require('../src/scripts/targeted-search');

// ─── calcStalenessPenalty ───────────────────────────────────

describe('calcStalenessPenalty', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const testCases = [
    { days: 10, expected: 0, label: '10 days (0-30 range)' },
    { days: 29, expected: 0, label: '29 days (just under 30)' },
    { days: 30, expected: -2, label: '30 days (boundary)' },
    { days: 45, expected: -2, label: '45 days (30-60 range)' },
    { days: 59, expected: -2, label: '59 days (just under 60)' },
    { days: 60, expected: -3, label: '60 days (boundary)' },
    { days: 75, expected: -3, label: '75 days (60-90 range)' },
    { days: 89, expected: -3, label: '89 days (just under 90)' },
    { days: 90, expected: -5, label: '90 days (boundary)' },
    { days: 100, expected: -5, label: '100 days (90+ range)' },
    { days: 365, expected: -5, label: '365 days (1 year)' },
  ];

  describe('PF source (uses property.listed_date)', () => {
    testCases.forEach(({ days, expected, label }) => {
      test(`${label} -> ${expected} penalty`, () => {
        const listedDate = new Date(now - days * dayMs).toISOString();
        const doc = { property: { listed_date: listedDate }, first_seen_at: null };

        expect(calcStalenessPenalty('pf', doc)).toBe(expected);
      });
    });

    test('PF falls back to first_seen_at when listed_date is missing', () => {
      const doc = {
        property: {},
        first_seen_at: new Date(now - 45 * dayMs),
      };
      expect(calcStalenessPenalty('pf', doc)).toBe(-2);
    });

    test('PF with null property and no first_seen_at -> assumes 30+ days penalty', () => {
      const doc = { property: null, first_seen_at: null };
      expect(calcStalenessPenalty('pf', doc)).toBe(-2);
    });
  });

  describe('Bayut source (uses first_seen_at)', () => {
    testCases.forEach(({ days, expected, label }) => {
      test(`${label} -> ${expected} penalty`, () => {
        const doc = { first_seen_at: new Date(now - days * dayMs) };
        expect(calcStalenessPenalty('bayut', doc)).toBe(expected);
      });
    });
  });

  describe('Dubizzle source (uses first_seen_at)', () => {
    testCases.forEach(({ days, expected, label }) => {
      test(`${label} -> ${expected} penalty`, () => {
        const doc = { first_seen_at: new Date(now - days * dayMs) };
        expect(calcStalenessPenalty('dubizzle', doc)).toBe(expected);
      });
    });
  });

  describe('Edge cases', () => {
    test('No date at all -> assumes 30+ days penalty (not 0)', () => {
      expect(calcStalenessPenalty('pf', { property: {} })).toBe(-2);
      expect(calcStalenessPenalty('bayut', {})).toBe(-2);
      expect(calcStalenessPenalty('dubizzle', {})).toBe(-2);
    });

    test('Future date -> 0 penalty', () => {
      const futureDate = new Date(now + 10 * dayMs);
      const doc = { first_seen_at: futureDate };
      expect(calcStalenessPenalty('bayut', doc)).toBe(0);
    });

    test('Exactly 0 days -> 0 penalty', () => {
      const doc = { first_seen_at: new Date() };
      expect(calcStalenessPenalty('bayut', doc)).toBe(0);
    });
  });
});

// ─── STALENESS_DECAY config ─────────────────────────────────

describe('STALENESS_DECAY configuration', () => {
  test('Is sorted descending by days (highest first)', () => {
    for (let i = 1; i < STALENESS_DECAY.length; i++) {
      expect(STALENESS_DECAY[i - 1].days).toBeGreaterThan(STALENESS_DECAY[i].days);
    }
  });

  test('Max penalty is -5', () => {
    const maxPenalty = Math.min(...STALENESS_DECAY.map((t) => t.penalty));
    expect(maxPenalty).toBe(-5);
  });

  test('All penalties are negative', () => {
    STALENESS_DECAY.forEach((tier) => {
      expect(tier.penalty).toBeLessThan(0);
    });
  });
});

// ─── SOURCES stale filter ───────────────────────────────────

describe('SOURCES query includes stale_since: null', () => {
  for (const [source, cfg] of Object.entries(SOURCES)) {
    test(`${source} query has stale_since: null`, () => {
      expect(cfg.query).toHaveProperty('stale_since', null);
    });
  }
});
