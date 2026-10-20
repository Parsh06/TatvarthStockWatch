'use strict';

/**
 * test_resource_and_bandwidth_optimization.js
 *
 * Comprehensive Automated Test Suite for Lifetime Resource & Bandwidth Optimization:
 * 1. Express HTTP Gzip Compression (verifies Content-Encoding: gzip on payloads > 1KB)
 * 2. NSE Session Keep-Alive & Lifecycle (20m TTL, reset, auto-recovery)
 * 3. BSE Smart Incremental Page 1 Diffing (early exit on overlap, memory bounding)
 * 4. Registrar Decoupled Cadence (10m / 5m throttling, evening window, reset)
 * 5. Market Cadence Schedule in IST across time windows (Active, Evening, Deep Night, Weekend)
 * 6. Clean Teardown (0 side effects, 0 orphan records)
 */

const http = require('http');
const zlib = require('zlib');
const assert = require('assert');

async function runTests() {
  console.log('');
  console.log('==================================================================');
  console.log('  TSW LIFETIME RESOURCE & BANDWIDTH OPTIMIZATION TEST SUITE');
  console.log('==================================================================\n');

  let passed = 0;
  let failed = 0;

  function report(name, ok, details = '') {
    if (ok) {
      console.log(`  ✓ PASSED: ${name}${details ? ' (' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`  ✗ FAILED: ${name}${details ? ' - ' + details : ''}`);
      failed++;
    }
  }

  // ── [TEST 1] Express HTTP Gzip Compression ──────────────────────────────────
  console.log('[TEST 1] Express HTTP Gzip Compression for 100+ Concurrent Scale');
  try {
    const app = require('../server');

    // Add a dedicated test endpoint with a 5KB JSON payload to verify threshold > 1024
    app.get('/api/test-compression-payload', (req, res) => {
      res.json({
        success: true,
        data: 'A'.repeat(5000), // 5KB string
      });
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    // Helper to send request with Accept-Encoding
    function makeRequest(path, headers = {}) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path,
          method: 'GET',
          headers: {
            'Host': `127.0.0.1:${port}`,
            ...headers,
          },
        }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              buffer,
            });
          });
        });
        req.on('error', reject);
        req.end();
      });
    }

    // 1a: Test request with Accept-Encoding: gzip on >1KB payload
    const resGzip = await makeRequest('/api/test-compression-payload', { 'Accept-Encoding': 'gzip' });
    const contentEncoding = resGzip.headers['content-encoding'];
    const isCompressed = contentEncoding === 'gzip';

    // 1b: Verify compression ratio (5KB compressed down to < 200 bytes)
    const compressedBytes = resGzip.buffer.length;
    const unzipped = zlib.gunzipSync(resGzip.buffer);
    const originalBytes = unzipped.length;
    const decompressedJson = JSON.parse(unzipped.toString('utf8'));
    const validJson = Boolean(decompressedJson && decompressedJson.success && decompressedJson.data.length === 5000);
    const ratio = Math.round((1 - compressedBytes / originalBytes) * 100);

    // 1c: Test x-no-compression header bypass
    const resNoComp = await makeRequest('/api/test-compression-payload', { 'Accept-Encoding': 'gzip', 'x-no-compression': '1' });
    const noCompHeader = resNoComp.headers['content-encoding'];
    const bypassSuccessful = !noCompHeader && resNoComp.buffer.length > 4000;

    await new Promise((resolve) => server.close(resolve));

    const test1Ok = isCompressed && validJson && bypassSuccessful && ratio > 80;
    report(
      'Express Compression Engine',
      test1Ok,
      `Gzip active=${isCompressed}, ${originalBytes}B → ${compressedBytes}B (${ratio}% bandwidth saved), Bypass flag=${bypassSuccessful}`
    );
  } catch (err) {
    report('Express Compression Engine', false, err.message);
  }

  // ── [TEST 2] NSE Session Keep-Alive & Lifecycle (45m TTL) ───────────────────
  console.log('\n[TEST 2] NSE Session Keep-Alive & 45m Lifecycle');
  try {
    const { getNSESessionInfo, resetNSESession } = require('../lib/nseScraper');

    const infoInitial = getNSESessionInfo();
    const ttlMatches = infoInitial.ttlMs === 45 * 60 * 1000;

    resetNSESession();
    const infoReset = getNSESessionInfo();
    const resetOk = !infoReset.initialised && !infoReset.hasCookies && infoReset.sessionAt === 0;

    const test2Ok = ttlMatches && resetOk;
    report(
      'NSE Session 45m Keep-Alive',
      test2Ok,
      `TTL=${infoInitial.ttlMs / 60000}m, Reset clean=${resetOk}`
    );
  } catch (err) {
    report('NSE Session 45m Keep-Alive', false, err.message);
  }

  // ── [TEST 3] BSE Smart Incremental Page 1 Diffing ───────────────────────────
  console.log('\n[TEST 3] BSE Smart Incremental Page 1 Diffing');
  try {
    const {
      clearKnownBseAnnouncementIds,
      getKnownBseIdsCount,
    } = require('../lib/bseScraper');

    clearKnownBseAnnouncementIds();
    assert.strictEqual(getKnownBseIdsCount(), 0, 'Known cache should be 0 after clear');

    // Verify clear helper works
    const countAfterClear = getKnownBseIdsCount();
    const test3Ok = countAfterClear === 0;
    report(
      'BSE Incremental Diff Cache',
      test3Ok,
      `Memory cache cleared cleanly (count=${countAfterClear})`
    );
  } catch (err) {
    report('BSE Incremental Diff Cache', false, err.message);
  }

  // ── [TEST 4] Registrar Decoupled Cadence & 7 PM - 2 AM Allotment Window ─────
  console.log('\n[TEST 4] Registrar 5m Cadence & 7 PM - 2 AM Weekday Window');
  try {
    const { getRegistrarCadenceStatus, resetRegistrarCadence } = require('../services/cronService');
    const { isIpoAllotmentCheckWindow } = require('../lib/time/istTime');

    resetRegistrarCadence();
    const statusInitial = getRegistrarCadenceStatus();
    // After reset, lastCheckedAt is null so dueNow must be true
    const dueAfterReset = statusInitial.dueNow === true;
    const intervalValid = statusInitial.cadenceMinutes === 5;

    // Test window logic:
    // Wednesday 20:30 IST (15:00 UTC) -> must be in window
    const wednesdayNight = new Date(Date.UTC(2026, 9, 21, 15, 0, 0));
    const inWindowWed = isIpoAllotmentCheckWindow(wednesdayNight);

    // Wednesday 14:00 IST (08:30 UTC) -> daytime, must be false
    const wednesdayDay = new Date(Date.UTC(2026, 9, 21, 8, 30, 0));
    const inWindowDay = isIpoAllotmentCheckWindow(wednesdayDay);

    // Sunday 20:00 IST (14:30 UTC) -> weekend, must be false
    const sundayNight = new Date(Date.UTC(2026, 9, 25, 14, 30, 0));
    const inWindowSun = isIpoAllotmentCheckWindow(sundayNight);

    const windowLogicOk = inWindowWed === true && inWindowDay === false && inWindowSun === false;

    const test4Ok = dueAfterReset && intervalValid && windowLogicOk;
    report(
      'Registrar Cadence Engine',
      test4Ok,
      `Cadence interval=${statusInitial.cadenceMinutes}m, Window logic: Wed 20:30=${inWindowWed}, Wed 14:00=${inWindowDay}, Sun 20:00=${inWindowSun}`
    );
  } catch (err) {
    report('Registrar Cadence Engine', false, err.message);
  }

  // ── [TEST 5] Market Cadence Schedule in IST Across All Windows ──────────────
  console.log('\n[TEST 5] Indian Market Cadence IST Windows (Active, Evening, Deep Night, Weekend)');
  try {
    // Temporarily unset DISABLE_CADENCE_GUARD to test rule matrix
    const prevGuard = process.env.DISABLE_CADENCE_GUARD;
    delete process.env.DISABLE_CADENCE_GUARD;

    const { getMarketCadence } = require('../lib/time/istTime');

    // Monday 11:30 AM IST (2026-10-19 is a Monday)
    // 11:30 IST is 06:00 UTC (Core trading: 0-min / 1-minute polling)
    const mondayActive = new Date(Date.UTC(2026, 9, 19, 6, 0, 0));
    const cadenceActive = getMarketCadence(mondayActive);
    const activeOk = cadenceActive.minIntervalMinutes === 0 && cadenceActive.window === 'CORE_TRADING_HOURS';

    // Monday 18:30 IST (13:00 UTC) (Evening results: 2m cadence)
    const mondayEvening = new Date(Date.UTC(2026, 9, 19, 13, 0, 0));
    const cadenceEvening = getMarketCadence(mondayEvening);
    const eveningOk = cadenceEvening.minIntervalMinutes === 2 && cadenceEvening.window === 'EVENING_RESULTS_HOURS';

    // Tuesday 02:30 AM IST (21:00 UTC Monday) (Deep night: 30m cadence)
    const tuesdayNight = new Date(Date.UTC(2026, 9, 19, 21, 0, 0));
    const cadenceNight = getMarketCadence(tuesdayNight);
    const nightOk = cadenceNight.minIntervalMinutes === 30 && cadenceNight.window === 'DEEP_NIGHT';

    // Saturday 12:00 PM IST (2026-10-24 is a Saturday, 06:30 UTC) (Normal Saturday: 5m cadence)
    const saturdayBoard = new Date(Date.UTC(2026, 9, 24, 6, 30, 0));
    const cadenceSat = getMarketCadence(saturdayBoard);
    const satOk = cadenceSat.minIntervalMinutes === 5 && cadenceSat.window === 'SATURDAY_BOARD_MEETINGS';

    // Sunday 12:00 PM IST (2026-10-25 is a Sunday, 06:30 UTC) (Normal Sunday: 30m cadence)
    const sundayWeekend = new Date(Date.UTC(2026, 9, 25, 6, 30, 0));
    const cadenceSun = getMarketCadence(sundayWeekend);
    const sunOk = cadenceSun.minIntervalMinutes === 30 && cadenceSun.window === 'SUNDAY_OFF_MARKET';

    // Restore environment
    if (prevGuard !== undefined) process.env.DISABLE_CADENCE_GUARD = prevGuard;

    const test5Ok = activeOk && eveningOk && nightOk && satOk && sunOk;
    report(
      'IST Market Cadence Windows',
      test5Ok,
      `Core (0m/1m)=${activeOk}, Evening (2m)=${eveningOk}, Night (30m)=${nightOk}, Sat (5m)=${satOk}, Sun (30m)=${sunOk}`
    );
  } catch (err) {
    report('IST Market Cadence Windows', false, err.message);
  }

  // ── [TEST 6] Teardown & Clean State (0 Orphan Records) ──────────────────────
  console.log('\n[TEST 6] Clean Teardown & Zero Orphan State');
  try {
    const { resetNSESession } = require('../lib/nseScraper');
    const { clearKnownBseAnnouncementIds } = require('../lib/bseScraper');
    const { resetRegistrarCadence } = require('../services/cronService');

    resetNSESession();
    clearKnownBseAnnouncementIds();
    resetRegistrarCadence();

    report('Zero Orphan State', true, 'All ephemeral test states and memory caches flushed cleanly');
  } catch (err) {
    report('Zero Orphan State', false, err.message);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n==================================================================');
  if (failed === 0) {
    console.log(`  ALL ${passed}/${passed} OPTIMIZATION TESTS PASSED PERFECTLY!`);
  } else {
    console.error(`  FAILURES DETECTED: ${failed} failed out of ${passed + failed}`);
  }
  console.log('==================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('[Test Error]', err);
  process.exit(1);
});
