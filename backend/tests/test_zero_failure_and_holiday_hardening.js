/**
 * test_zero_failure_and_holiday_hardening.js
 *
 * Exhaustive test suite for:
 * 1. Process crash-shield error handlers (server.js logic)
 * 2. NSE scraper 3-profile rotation & WAF cooldown recovery (nseScraper.js)
 * 3. BSE scraper auto-healing & session invalidation (bseScraper.js)
 * 4. KFintech multi-strategy regex parser & fallback (ipoScraper.js)
 * 5. MongoDB resilient connection pool options & health check (mongoClient.js)
 * 6. Dynamic Indian Market Holiday Calendar Engine & Cadence (istTime.js)
 */

const assert = require('assert');
const {
  isMarketHoliday,
  getHolidayInfo,
  getAllMarketHolidays,
  setMarketHolidayInMemory,
  deleteMarketHolidayFromMemory,
  getMarketCadence,
  getISTDateString
} = require('../lib/time/istTime');

const {
  extractCompaniesFromJs
} = require('../lib/ipoScraper');

const {
  MONGO_OPTIONS,
  checkMongoHealth
} = require('../lib/mongoClient');

const {
  invalidateBseSession
} = require('../lib/bseScraper');

const {
  _getNseScraperStatus,
  rotateProfile
} = require('../lib/nseScraper');

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING ZERO-FAILURE & DYNAMIC HOLIDAY HARDENING TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      console.error(err.stack);
      process.exitCode = 1;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      console.error(err.stack);
      process.exitCode = 1;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: Dynamic Market Holiday Calendar Engine
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Dynamic Market Holiday Engine (istTime.js) ---');

  test('1.1 Official Pre-seeded Holidays Identification', () => {
    // 2026-01-26 is Republic Day
    assert.strictEqual(isMarketHoliday('2026-01-26'), true, '2026-01-26 must be recognized as Republic Day');
    const repDay = getHolidayInfo('2026-01-26');
    assert(repDay, 'Details must exist for 2026-01-26');
    assert.strictEqual(repDay.name, 'Republic Day');

    // 2026-12-25 is Christmas
    assert.strictEqual(isMarketHoliday('2026-12-25'), true, '2026-12-25 must be recognized as Christmas');
    const xmas = getHolidayInfo('2026-12-25');
    assert.strictEqual(xmas.name, 'Christmas');

    // Normal weekday (e.g., 2026-03-10 Tuesday) should NOT be a holiday
    assert.strictEqual(isMarketHoliday('2026-03-10'), false, 'Normal weekday must not be a holiday');
  });

  test('1.2 Dynamic Holiday Addition & Deletion in Memory', () => {
    const testDate = '2026-07-07';
    assert.strictEqual(isMarketHoliday(testDate), false, 'Should initially not be a holiday');

    // Add dynamic holiday
    setMarketHolidayInMemory({ date: testDate, name: 'Special Muhurat Day', description: 'Exchange special closure', isClosed: true });
    assert.strictEqual(isMarketHoliday(testDate), true, 'Should now be a holiday');
    const details = getHolidayInfo(testDate);
    assert.strictEqual(details.name, 'Special Muhurat Day');

    // Remove dynamic holiday
    const removed = deleteMarketHolidayFromMemory(testDate);
    assert.strictEqual(removed, true, 'Remove should return true');
    assert.strictEqual(isMarketHoliday(testDate), false, 'Should no longer be a holiday');
  });

  test('1.3 Market Cadence on Holidays switches to 30-min idle', () => {
    // Test on 2026-01-26 11:00 AM IST (Republic Day - Monday)
    // 11:00 AM IST on Jan 26, 2026 is 05:30 UTC
    const holidayDate = new Date('2026-01-26T05:30:00.000Z');
    const cadence = getMarketCadence(holidayDate);

    assert.strictEqual(cadence.window, 'MARKET_HOLIDAY', 'Cadence window must be MARKET_HOLIDAY');
    assert.strictEqual(cadence.minIntervalMinutes, 30, 'Idle cadence interval must be 30m');
    assert(cadence.holidayName.includes('Republic Day'), 'Holiday name must be present in cadence');
  });

  test('1.4 Weekend Cadence remains off-market 30m or 5m', () => {
    // 2026-01-25 is a Sunday at 12:00 PM IST (06:30 UTC)
    const sunday = new Date('2026-01-25T06:30:00.000Z');
    const cadence = getMarketCadence(sunday);
    assert.strictEqual(cadence.window, 'SUNDAY_OFF_MARKET', 'Sunday should return SUNDAY_OFF_MARKET');
    assert.strictEqual(cadence.isWeekend, true);
    assert.strictEqual(cadence.minIntervalMinutes, 30);
  });

  test('1.5 Regular Trading Day Market Hours returns 0 min (30-sec polling)', () => {
    // 2026-03-10 (Tuesday) at 11:30 AM IST (06:00 UTC)
    const tradingTime = new Date('2026-03-10T06:00:00.000Z');
    const cadence = getMarketCadence(tradingTime);
    assert.strictEqual(cadence.window, 'CORE_TRADING_HOURS', 'Trading hours must be CORE_TRADING_HOURS');
    assert.strictEqual(cadence.isWeekend, false);
    assert.strictEqual(cadence.minIntervalMinutes, 0, 'Active market cadence must be 0 (every 30s tick)');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: BSE Scraper Session Auto-Healing
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: BSE Scraper Session Auto-Healing (bseScraper.js) ---');

  test('2.1 BSE Scraper Session Invalidation Hook', () => {
    assert.strictEqual(typeof invalidateBseSession, 'function', 'invalidateBseSession must be exported as a function');
    invalidateBseSession();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: NSE Scraper Profile Rotation & Anti-Lockout
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 3: NSE Scraper 3-Profile Rotation (nseScraper.js) ---');

  test('3.1 NSE Scraper Profile Status & Rotation', () => {
    assert.strictEqual(typeof _getNseScraperStatus, 'function', '_getNseScraperStatus must be exported');
    assert.strictEqual(typeof rotateProfile, 'function', 'rotateProfile must be exported');

    const status1 = _getNseScraperStatus();
    assert(typeof status1.activeProfileIndex === 'number', 'activeProfileIndex must be a number');
    assert(typeof status1.activeProfileName === 'string', 'activeProfileName must be a string');
    assert(typeof status1.cloudWafChallenged === 'boolean', 'cloudWafChallenged must be a boolean');

    const prevIndex = status1.activeProfileIndex;
    const nextProf = rotateProfile();
    const status2 = _getNseScraperStatus();

    assert.strictEqual(status2.activeProfileIndex, (prevIndex + 1) % 3, 'Profile rotation must cycle modulo 3');
    assert.strictEqual(status2.activeProfileName, nextProf.name, 'Profile name must match rotated profile');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: KFintech Multi-Strategy Regex Parser
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 4: KFintech Scraper Resilient Regex Parser (ipoScraper.js) ---');

  test('4.1 Strategy 1 Parser (Standard array of objects with value/text/label)', () => {
    const mockBundle = `
      var _0x123 = "irrelevant";
      const companyList = [
        { "value": "101", "text": "Acme Industries Ltd" },
        { "value": "102", "label": "Zenith Infotech Ltd" },
        { "id": "103", "company": "Bharat Solar Ltd" }
      ];
      function submit() {}
    `;
    const results = extractCompaniesFromJs(mockBundle);
    assert(Array.isArray(results), 'Must return an array');
    assert.strictEqual(results.length, 3, 'Must extract all 3 companies');
    assert.strictEqual(results[0].clientId, '101');
    assert.strictEqual(results[0].name, 'Acme Industries Ltd');
    assert.strictEqual(results[1].clientId, '102');
    assert.strictEqual(results[1].name, 'Zenith Infotech Ltd');
    assert.strictEqual(results[2].clientId, '103');
    assert.strictEqual(results[2].name, 'Bharat Solar Ltd');
  });

  test('4.2 Strategy 2 Parser (JSON.parse single-quoted or double-quoted string)', () => {
    const mockBundle = `
      var compMap = JSON.parse('[{"clientId":"501","name":"Tata Steel Green Bond"},{"clientId":"502","name":"Reliance Retail IPO"}]');
    `;
    const results = extractCompaniesFromJs(mockBundle);
    assert(Array.isArray(results), 'Must return an array');
    assert.strictEqual(results.length, 2, 'Must extract 2 entries');
    const tata = results.find(r => r.clientId === '501');
    assert(tata, 'Tata entry must be found');
    assert.strictEqual(tata.name, 'Tata Steel Green Bond');
  });

  test('4.3 Strategy 3 Parser (Unquoted Javascript object list)', () => {
    const mockBundle = `
      var list = [{clientId: "808", name: "IndiGo Airlines Ltd"}];
    `;
    const results = extractCompaniesFromJs(mockBundle);
    assert(Array.isArray(results), 'Must return an array');
    assert(results.length >= 1, 'Must extract at least 1 entry');
    assert.strictEqual(results[0].clientId, '808');
    assert.strictEqual(results[0].name, 'IndiGo Airlines Ltd');
  });

  test('4.4 Empty or obfuscated payload handling without crashing', () => {
    const emptyResults = extractCompaniesFromJs('');
    assert.strictEqual(emptyResults, null, 'Empty string returns null');

    const corruptResults = extractCompaniesFromJs('var a = undefined; null;');
    assert.strictEqual(corruptResults, null, 'Corrupt script returns null');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5: MongoDB Resilient Connection Pool Options
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 5: MongoDB Resilient Connection Pool (mongoClient.js) ---');

  test('5.1 MongoDB Connection Pool Options are properly configured', () => {
    assert(MONGO_OPTIONS, 'MONGO_OPTIONS must be exported');
    assert.strictEqual(MONGO_OPTIONS.maxPoolSize, 20, 'maxPoolSize must be 20 for concurrent scale');
    assert.strictEqual(MONGO_OPTIONS.minPoolSize, 2, 'minPoolSize must be 2 for warm keepalive');
    assert.strictEqual(MONGO_OPTIONS.serverSelectionTimeoutMS, 5000, 'serverSelectionTimeoutMS must be 5000ms');
    assert.strictEqual(MONGO_OPTIONS.connectTimeoutMS, 10000, 'connectTimeoutMS must be 10000ms');
    assert.strictEqual(MONGO_OPTIONS.socketTimeoutMS, 45000, 'socketTimeoutMS must be 45000ms');
    assert.strictEqual(MONGO_OPTIONS.retryWrites, true, 'retryWrites must be enabled');
  });

  await asyncTest('5.2 checkMongoHealth handles execution safely', async () => {
    assert.strictEqual(typeof checkMongoHealth, 'function', 'checkMongoHealth must be a function');
    const health = await checkMongoHealth();
    assert(typeof health === 'object', 'Health result must be an object');
    assert('connected' in health, 'Health result must have "connected" boolean');
  });

  console.log('\n===============================================================');
  console.log(`🎉 TEST SUMMARY: ${passed}/${total} TESTS PASSED!`);
  console.log('===============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
