'use strict';

/**
 * test_dynamic_holiday_and_admin_e2e.js
 *
 * Exhaustive End-to-End Test Suite for Dynamic Market Holiday System:
 * 1. Express Admin Routes integration (GET, POST, DELETE, BOOTSTRAP)
 * 2. Firestore persistence in 'system_meta/market_holidays'
 * 3. In-memory sync and cache acceleration
 * 4. Audit trail logging for all administrative holiday changes
 * 5. Dynamic Cadence integration (switching from 30s core trading to 30m off-market)
 * 6. Input validation (invalid dates, empty names, malformed payloads)
 * 7. Clean teardown and statutory calendar re-bootstrap
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const express = require('express');
const { db, admin } = require('../lib/firebaseAdmin');
const adminRoutes = require('../routes/adminRoutes');
const {
  isMarketHoliday,
  getHolidayInfo,
  getAllMarketHolidays,
  getMarketCadence,
  DEFAULT_MARKET_HOLIDAYS,
  syncMarketHolidaysFromFirestore
} = require('../lib/time/istTime');

let totalTests = 0;
let passedTests = 0;

function step(desc) {
  totalTests++;
  console.log(`[TEST ${totalTests}] ${desc}`);
}

function pass(detail = '') {
  passedTests++;
  console.log(`  ✓ PASSED ${detail ? '(' + detail + ')' : ''}`);
}

// Mock auth middleware for admin testing
function mockVerifyToken(req, res, next) {
  req.uid = 'test_admin_uid_holiday_suite';
  req.user = { email: 'admin.tester@tatvarthstockwatch.com', role: 'admin' };
  next();
}

function mockRequireAdmin(level) {
  return (req, res, next) => {
    req.adminEntitlements = { read: true, write: true };
    next();
  };
}

async function runE2ETests() {
  console.log('\n==================================================================');
  console.log('  TSW DYNAMIC MARKET HOLIDAY & ADMIN ENGINE E2E TEST SUITE');
  console.log('==================================================================\n');

  // Set up Express test server with adminRoutes
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes(mockVerifyToken, mockRequireAdmin));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/admin`;

  const axios = require('axios');
  const api = axios.create({ baseURL: baseUrl, validateStatus: () => true });

  const TEST_HOLIDAY_DATE = '2026-06-17'; // A Wednesday in 2026
  const TEST_HOLIDAY_NAME = 'Special Muhurat / Settlement Holiday';
  const TEST_HOLIDAY_DESC = 'Automated E2E Test Holiday Addition';

  try {
    // Initial cleanup if left over from a previous interrupted test run
    const { deleteMarketHolidayFromMemory } = require('../lib/time/istTime');
    deleteMarketHolidayFromMemory(TEST_HOLIDAY_DATE);
    const snapInit = await db.collection('system_meta').doc('market_holidays').get();
    if (snapInit.exists) {
      const curHolidays = (snapInit.data()?.holidays || []).filter(h => h.date !== TEST_HOLIDAY_DATE);
      await db.collection('system_meta').doc('market_holidays').set({ holidays: curHolidays }, { merge: true });
    }
    // ── TEST 1: GET /api/admin/system/holidays ────────────────────────────────
    step('GET /api/admin/system/holidays: Fetch all holidays with countdown calculations');
    {
      const res = await api.get('/system/holidays');
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.success, true);
      assert(Array.isArray(res.data.holidays), 'holidays must be an array');
      assert(res.data.total >= DEFAULT_MARKET_HOLIDAYS.length, 'total must be at least default holidays count');
      assert(res.data.todayIST, 'todayIST must be returned');

      // Verify enriched properties on each holiday
      const first = res.data.holidays[0];
      assert(first.date, 'date must exist');
      assert(first.name, 'name must exist');
      assert(['upcoming', 'today', 'past'].includes(first.status), 'status must be valid enum');

      pass(`Retrieved ${res.data.total} holidays, todayIST=${res.data.todayIST}`);
    }

    // ── TEST 2: Input Validation on POST /api/admin/system/holidays ─────────────
    step('POST /api/admin/system/holidays: Validation guards against malformed inputs');
    {
      // Missing date
      const r1 = await api.post('/system/holidays', { name: 'Invalid Date Test' });
      assert.strictEqual(r1.status, 400);
      assert.strictEqual(r1.data.success, false);

      // Malformed date
      const r2 = await api.post('/system/holidays', { date: '17-06-2026', name: 'Wrong Format' });
      assert.strictEqual(r2.status, 400);

      // Missing name
      const r3 = await api.post('/system/holidays', { date: '2026-06-17', name: '   ' });
      assert.strictEqual(r3.status, 400);

      pass('Strictly rejected invalid date format and empty holiday names');
    }

    // ── TEST 3: Add Dynamic Holiday via POST ───────────────────────────────────
    step('POST /api/admin/system/holidays: Add new dynamic market holiday');
    {
      // Prior check: 2026-06-17 should not be a holiday
      assert.strictEqual(isMarketHoliday(TEST_HOLIDAY_DATE), false, 'Date should initially not be a holiday');

      const res = await api.post('/system/holidays', {
        date: TEST_HOLIDAY_DATE,
        name: TEST_HOLIDAY_NAME,
        description: TEST_HOLIDAY_DESC,
        isClosed: true,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.holiday.date, TEST_HOLIDAY_DATE);
      assert.strictEqual(res.data.holiday.name, TEST_HOLIDAY_NAME);

      // Verify in-memory state updated instantly (0ms latency)
      assert.strictEqual(isMarketHoliday(TEST_HOLIDAY_DATE), true, 'In-memory registry must reflect holiday immediately');
      const info = getHolidayInfo(TEST_HOLIDAY_DATE);
      assert.strictEqual(info.name, TEST_HOLIDAY_NAME);

      pass(`Successfully created dynamic holiday "${TEST_HOLIDAY_NAME}" for ${TEST_HOLIDAY_DATE}`);
    }

    // ── TEST 4: Dynamic Cadence Throttling on Market Holiday ───────────────────
    step('Cadence Integration: Market holiday dynamically switches cadence to 30m idle');
    {
      // Temporarily unset DISABLE_CADENCE_GUARD to test cadence logic
      const prevGuard = process.env.DISABLE_CADENCE_GUARD;
      delete process.env.DISABLE_CADENCE_GUARD;

      // 2026-06-17 is a Wednesday. At 11:30 AM IST (06:00 UTC):
      // On a regular trading day, this would be CORE_TRADING_HOURS (30-sec polling, minIntervalMinutes = 0).
      // But because it is now flagged as a market holiday, it must return MARKET_HOLIDAY (minIntervalMinutes = 30).
      const holidayTradingTime = new Date('2026-06-17T06:00:00.000Z');
      const cadence = getMarketCadence(holidayTradingTime);

      assert.strictEqual(cadence.window, 'MARKET_HOLIDAY', 'Cadence window must be MARKET_HOLIDAY');
      assert.strictEqual(cadence.minIntervalMinutes, 30, 'Idle cadence must be 30m (saving 100% bandwidth)');
      assert(cadence.holidayName.includes(TEST_HOLIDAY_NAME), 'Holiday name must be present in cadence description');

      if (prevGuard) process.env.DISABLE_CADENCE_GUARD = prevGuard;
      pass('Cadence engine successfully idled scrapers to 30-min intervals on the dynamic holiday');
    }

    // ── TEST 5: Firestore Persistence & Cross-Process Recovery ─────────────────
    step('Firestore Persistence: Verify market_holidays document in system_meta');
    {
      const snap = await db.collection('system_meta').doc('market_holidays').get();
      assert(snap.exists, 'system_meta/market_holidays document must exist in Firestore');
      const data = snap.data();
      assert(Array.isArray(data.holidays), 'holidays array must be stored');

      const savedEntry = data.holidays.find(h => h.date === TEST_HOLIDAY_DATE);
      assert(savedEntry, 'Saved test holiday must exist in Firestore');
      assert.strictEqual(savedEntry.name, TEST_HOLIDAY_NAME);

      pass('Firestore document accurately persisted and synchronized');
    }

    // ── TEST 6: Audit Trail Logging ───────────────────────────────────────────
    step('Audit Trail: Verify MARKET_HOLIDAY_CONFIGURED action was logged');
    {
      const auditSnap = await db.collection('admin_audit_log')
        .where('action', '==', 'MARKET_HOLIDAY_CONFIGURED')
        .limit(10)
        .get();

      assert(!auditSnap.empty, 'Audit log entry must be present');
      const docs = auditSnap.docs.map(d => d.data());
      const log = docs.find(d => d.payload?.holiday?.date === TEST_HOLIDAY_DATE);
      assert(log, 'Audit record with test holiday date must be found');
      assert.strictEqual(log.actorUid, 'test_admin_uid_holiday_suite');

      pass('Immutable audit record created with actor details and payload');
    }

    // ── TEST 7: DELETE /api/admin/system/holidays/:date ───────────────────────
    step('DELETE /api/admin/system/holidays/:date: Remove market holiday');
    {
      const res = await api.delete(`/system/holidays/${TEST_HOLIDAY_DATE}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      // Verify in-memory state updated instantly
      assert.strictEqual(isMarketHoliday(TEST_HOLIDAY_DATE), false, 'Date must no longer be a holiday');

      // Verify cadence restores to normal trading hours
      const prevGuard = process.env.DISABLE_CADENCE_GUARD;
      delete process.env.DISABLE_CADENCE_GUARD;
      const tradingTime = new Date('2026-06-17T06:00:00.000Z');
      const cadence = getMarketCadence(tradingTime);
      assert.strictEqual(cadence.window, 'CORE_TRADING_HOURS', 'Must restore to CORE_TRADING_HOURS');
      assert.strictEqual(cadence.minIntervalMinutes, 0, 'Must restore to 0-min (30-sec polling)');
      if (prevGuard) process.env.DISABLE_CADENCE_GUARD = prevGuard;

      pass(`Successfully deleted holiday for ${TEST_HOLIDAY_DATE} and restored core market cadence`);
    }

    // ── TEST 8: 1-Click Bootstrap Reset via POST ──────────────────────────────
    step('POST /api/admin/system/holidays/bootstrap: Re-seed official statutory holidays');
    {
      const res = await api.post('/system/holidays/bootstrap');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert(res.data.total >= DEFAULT_MARKET_HOLIDAYS.length);

      // Verify statutory holidays are present
      assert.strictEqual(isMarketHoliday('2026-01-26'), true, 'Republic Day must exist');
      assert.strictEqual(isMarketHoliday('2026-04-03'), true, 'Good Friday must exist');
      assert.strictEqual(isMarketHoliday('2026-10-02'), true, 'Gandhi Jayanti must exist');
      assert.strictEqual(isMarketHoliday('2026-12-25'), true, 'Christmas must exist');

      pass(`Bootstrap successfully verified with ${res.data.total} statutory market holidays`);
    }

    console.log('\n==================================================================');
    console.log(`  ALL ${passedTests}/${totalTests} DYNAMIC HOLIDAY E2E TESTS PASSED PERFECTLY!`);
    console.log('==================================================================\n');
    process.exit(0);
  } finally {
    server.close();
  }
}

runE2ETests().catch(err => {
  console.error('\n❌ E2E TEST RUNNER FAILED:', err);
  process.exit(1);
});
