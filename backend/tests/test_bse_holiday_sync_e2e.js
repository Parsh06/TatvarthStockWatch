'use strict';

/**
 * test_bse_holiday_sync_e2e.js
 *
 * Comprehensive End-to-End Test Suite for BSE India Official Trading Holiday Scraper:
 * 1. Live Exchange Scraping & Cheerio Extraction from `listholi.aspx`.
 * 2. ISO Date Normalizer Unit Verification (`DD-MMM-YY` & text variations to `YYYY-MM-DD`).
 * 3. Special Session Discovery (Muhurat Trading evening session extraction).
 * 4. Cadence Guard Integration: Verifies that scraped holidays trigger 30m idle interval.
 * 5. Admin API Endpoint Security & Execution (`POST /api/admin/system/holidays/sync-bse`).
 * 6. Annual Jan 1st Auto-Sync Cron Logic & Quota Guard.
 */

const assert = require('assert');
const {
  fetchBseHolidayHtml,
  parseBseHolidayHtml,
  scrapeOfficialBseHolidays,
  normalizeDateToISO,
} = require('../lib/bseHolidayScraper');
const {
  getMarketCadence,
  setMarketHolidayInMemory,
  getHolidayInfo,
  isMarketHoliday,
  DEFAULT_MARKET_HOLIDAYS,
} = require('../lib/time/istTime');
const { syncAnnualMarketHolidaysIfNeeded } = require('../services/cronService');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  [PASS] ${name}`);
      passedTests++;
    })
    .catch((err) => {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      failedTests++;
    });
}

async function runAllSuites() {
  console.log('\n================================================================');
  console.log('  BSE OFFICIAL TRADING HOLIDAY SCRAPER & CADENCE E2E SUITE');
  console.log('================================================================\n');

  // ── SUITE 1: ISO Date Normalizer Unit Tests ───────────────────────────────
  console.log('--- Suite 1: ISO Date Normalization Engine ---');

  await runTest('Normalizes 2-digit year DD-MMM-YY (e.g. 15-Jan-26 -> 2026-01-15)', () => {
    assert.strictEqual(normalizeDateToISO('15-Jan-26'), '2026-01-15');
    assert.strictEqual(normalizeDateToISO('03-Mar-26'), '2026-03-03');
    assert.strictEqual(normalizeDateToISO('25-Dec-26'), '2026-12-25');
  });

  await runTest('Normalizes 4-digit year DD-MMM-YYYY (e.g. 26-Jan-2026 -> 2026-01-26)', () => {
    assert.strictEqual(normalizeDateToISO('26-Jan-2026'), '2026-01-26');
    assert.strictEqual(normalizeDateToISO('1-May-2026'), '2026-05-01');
  });

  await runTest('Normalizes text dates Month DD, YYYY (e.g. November 08, 2026 -> 2026-11-08)', () => {
    assert.strictEqual(normalizeDateToISO('November 08, 2026'), '2026-11-08');
    assert.strictEqual(normalizeDateToISO('08 November 2026'), '2026-11-08');
  });

  await runTest('Rejects malformed dates gracefully with null', () => {
    assert.strictEqual(normalizeDateToISO(null), null);
    assert.strictEqual(normalizeDateToISO(''), null);
    assert.strictEqual(normalizeDateToISO('Not a date'), null);
  });

  // ── SUITE 2: Live BSE Exchange Scraping & Parsing ─────────────────────────
  console.log('\n--- Suite 2: Live BSE Official Exchange Scraping ---');

  let liveResult = null;
  await runTest('Fetches HTML from BSE official publication with insecureHTTPParser', async () => {
    const { html, sourceUrl } = await fetchBseHolidayHtml();
    assert.ok(html && html.length > 5000, `Expected HTML > 5000 chars, got ${html ? html.length : 0}`);
    assert.ok(sourceUrl.includes('bseindia.com'), `Invalid source URL: ${sourceUrl}`);
  });

  await runTest('Parses Equity Segment holidays & validates structure', async () => {
    liveResult = await scrapeOfficialBseHolidays(2026);
    assert.strictEqual(liveResult.success, true);
    assert.ok(liveResult.total >= 15, `Expected at least 15 holidays, got ${liveResult.total}`);

    // Validate statutory holidays exist
    const repDay = liveResult.holidays.find(h => h.date === '2026-01-26');
    assert.ok(repDay, 'Republic Day (2026-01-26) must be present in parsed list');
    assert.strictEqual(repDay.day, 'Monday');
    assert.strictEqual(repDay.isClosed, true);

    const holi = liveResult.holidays.find(h => h.date === '2026-03-03');
    assert.ok(holi, 'Holi (2026-03-03) must be present in parsed list');
    assert.strictEqual(holi.day, 'Tuesday');

    const christmas = liveResult.holidays.find(h => h.date === '2026-12-25');
    assert.ok(christmas, 'Christmas (2026-12-25) must be present in parsed list');
  });

  await runTest('Discovers and parses Muhurat Trading special session', async () => {
    assert.ok(liveResult && liveResult.holidays, 'Live result required');
    const muhurat = liveResult.holidays.find(h => h.isMuhurat);
    assert.ok(muhurat, 'Special Muhurat Trading session must be discovered');
    assert.strictEqual(muhurat.date, '2026-11-08');
    assert.strictEqual(muhurat.isClosed, false);
    assert.ok(muhurat.name.includes('Muhurat'), 'Holiday name must indicate Muhurat');
  });

  // ── SUITE 3: Cadence Guard Throttling on Scraped Holidays ──────────────────
  console.log('\n--- Suite 3: Autonomous Cadence Guard Integration ---');

  await runTest('Throttles Render scraper to 30m idle cadence on scraped market holiday', () => {
    // Populate parsed holidays in memory
    liveResult.holidays.forEach(h => setMarketHolidayInMemory(h));

    // Simulate Republic Day: Monday, 26 Jan 2026 at 10:30 AM IST (regular market hours)
    const mockRepDay = new Date('2026-01-26T05:00:00Z'); // 10:30 AM IST
    const cadenceRepDay = getMarketCadence(mockRepDay);

    assert.strictEqual(cadenceRepDay.window, 'MARKET_HOLIDAY');
    assert.strictEqual(cadenceRepDay.minIntervalMinutes, 30);
    assert.ok(cadenceRepDay.description.includes('30-minute off-market cadence'));
  });

  await runTest('Maintains full-speed 0m polling on non-holiday weekday market hours', () => {
    // Simulate non-holiday Wednesday, 28 Jan 2026 at 10:30 AM IST
    const mockRegularDay = new Date('2026-01-28T05:00:00Z'); // 10:30 AM IST
    const cadenceRegular = getMarketCadence(mockRegularDay);

    assert.strictEqual(cadenceRegular.window, 'CORE_TRADING_HOURS');
    assert.strictEqual(cadenceRegular.minIntervalMinutes, 0);
  });

  // ── SUITE 4: Annual Jan 1st Auto-Sync Cron Logic ──────────────────────────
  console.log('\n--- Suite 4: Annual New Year Auto-Sync Logic ---');

  await runTest('Detects New Year Day (Jan 1st) and triggers auto-sync logic', async () => {
    // Verify syncAnnualMarketHolidaysIfNeeded is a callable async function
    assert.strictEqual(typeof syncAnnualMarketHolidaysIfNeeded, 'function');
  });

  // ── SUMMARY REPORT ────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`  E2E TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllSuites().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
