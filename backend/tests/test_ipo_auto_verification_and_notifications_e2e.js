'use strict';

/**
 * test_ipo_auto_verification_and_notifications_e2e.js
 *
 * End-to-End Test Suite for the Two-Stage Automated IPO Allotment Engine:
 * 1. Module exports & interface validation.
 * 2. Stage 1 Immediate Broadcast Notification delivery & alert logging.
 * 3. Stage 2 5-Minute Delayed Scheduling & MongoDB persistence.
 * 4. Unified dispatchNewIpoAllotment orchestration (Stage 1 + Stage 2).
 * 5. Overdue scheduled checks processor (reboot resilience).
 * 6. Family PAN encryption, decryption & on-demand family member checking.
 * 7. Ephemeral 24-hour deduplication locking in MongoDB Atlas.
 * 8. Registrar discovery cadence (daytime 20m + evening 5m window).
 * 9. API endpoint mounting: POST /api/ipo/check-my-family.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { 
  broadcastStage1IpoAllotment,
  scheduleStage2FamilyPanCheck,
  dispatchNewIpoAllotment,
  processPendingScheduledChecks,
  triggerAutoAllotmentCheck,
  checkUserFamilyPans,
  normalizeRegistrarName,
} = require('../lib/ipoAutoVerificationService');

const { encryptPan, decryptPan, maskPan, validatePan } = require('../lib/ipoUtils');
const { getDb } = require('../lib/mongoClient');

async function runTests() {
  console.log('\n=== RUNNING TWO-STAGE IPO ALLOTMENT & FAMILY NOTIFICATIONS E2E TESTS ===\n');
  let passed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // ── TEST 1: Module Interface & Normalization ─────────────────────────────────
  test('Interface: All required two-stage engine functions are exported', () => {
    assert.strictEqual(typeof broadcastStage1IpoAllotment, 'function', 'broadcastStage1IpoAllotment must be a function');
    assert.strictEqual(typeof scheduleStage2FamilyPanCheck, 'function', 'scheduleStage2FamilyPanCheck must be a function');
    assert.strictEqual(typeof dispatchNewIpoAllotment, 'function', 'dispatchNewIpoAllotment must be a function');
    assert.strictEqual(typeof processPendingScheduledChecks, 'function', 'processPendingScheduledChecks must be a function');
    assert.strictEqual(typeof triggerAutoAllotmentCheck, 'function', 'triggerAutoAllotmentCheck must be a function');
    assert.strictEqual(typeof checkUserFamilyPans, 'function', 'checkUserFamilyPans must be a function');
    assert.strictEqual(typeof normalizeRegistrarName, 'function', 'normalizeRegistrarName must be a function');
  });

  test('Normalization: Registrar names normalize to canonical registrar identifiers', () => {
    assert.strictEqual(normalizeRegistrarName('LINKINTIME'), 'MUFG');
    assert.strictEqual(normalizeRegistrarName('link_intime'), 'MUFG');
    assert.strictEqual(normalizeRegistrarName('mufg'), 'MUFG');
    assert.strictEqual(normalizeRegistrarName('BIGSHARE'), 'BIGSHARE');
    assert.strictEqual(normalizeRegistrarName('big_share'), 'BIGSHARE');
    assert.strictEqual(normalizeRegistrarName('KFINTECH'), 'KFINTECH');
    assert.strictEqual(normalizeRegistrarName('kfin'), 'KFINTECH');
    assert.strictEqual(normalizeRegistrarName('unknown'), 'KFINTECH');
  });

  // ── TEST 2: AES-256-GCM Family PAN Encryption / Decryption ───────────────────
  test('Security: PAN encryption produces valid authTag, IV, and decrypts accurately', () => {
    const testPan = 'ABCDE1234F';
    assert.strictEqual(validatePan(testPan), true, 'PAN format validation failed');
    const enc = encryptPan(testPan);
    assert.ok(enc.encrypted && enc.iv && enc.authTag, 'Encrypted bundle missing keys');
    const decrypted = decryptPan(enc);
    assert.strictEqual(decrypted, testPan, 'Decrypted PAN does not match original');
    assert.strictEqual(maskPan(testPan), 'XXXXXX234F', 'Masked PAN should hide first 6 chars');
  });

  // ── TEST 3: Stage 2 5-Minute Delayed Scheduling in MongoDB ──────────────────
  await testAsync('Stage 2: scheduleStage2FamilyPanCheck persists future job with 5-min delay', async () => {
    const testSymbol = `TEST_IPO_${Date.now()}`;
    const res = await scheduleStage2FamilyPanCheck({
      symbol: testSymbol,
      registrar: 'MUFG',
      ipoName: 'Test Tech Ltd',
      delayMs: 300000, // 5 minutes
    });

    assert.strictEqual(res.scheduled, true, 'Job must report scheduled = true');
    assert.ok(res.jobId.includes(testSymbol), 'jobId must contain symbol');
    assert.ok(res.scheduledFor instanceof Date, 'scheduledFor must be a Date');
    const diffMs = res.scheduledFor.getTime() - Date.now();
    assert.ok(diffMs >= 290000 && diffMs <= 310000, `Expected ~300000ms delay, got ${diffMs}ms`);

    const mdb = await getDb();
    if (mdb) {
      const saved = await mdb.collection('ipo_scheduled_checks').findOne({ _id: res.jobId });
      assert.ok(saved, 'Scheduled check document must exist in MongoDB');
      assert.strictEqual(saved.status, 'PENDING');
      assert.strictEqual(saved.registrar, 'MUFG');
      assert.strictEqual(saved.symbol, testSymbol);
      // Clean up test document
      await mdb.collection('ipo_scheduled_checks').deleteOne({ _id: res.jobId });
    }
  });

  // ── TEST 4: Unified Dispatcher (Stage 1 + Stage 2) ──────────────────────────
  await testAsync('Dispatcher: dispatchNewIpoAllotment coordinates Stage 1 broadcast and Stage 2 scheduler', async () => {
    const testSymbol = `E2E_DISP_${Date.now()}`;
    const result = await dispatchNewIpoAllotment({
      ipo: { symbol: testSymbol, clientId: testSymbol, name: 'E2E Dispatcher Ltd' },
      registrar: 'BIGSHARE',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.symbol, testSymbol);
    assert.strictEqual(result.registrar, 'BIGSHARE');
    assert.ok(result.stage1, 'Stage 1 stats must be present');
    assert.ok(typeof result.stage1.totalUsers === 'number', 'Stage 1 must report evaluated users');
    assert.ok(result.stage2, 'Stage 2 schedule result must be present');
    assert.strictEqual(result.stage2.scheduled, true);

    const mdb = await getDb();
    if (mdb) {
      await mdb.collection('ipo_scheduled_checks').deleteOne({ _id: `BIGSHARE_${testSymbol}` });
    }
  });

  // ── TEST 5: Overdue Scheduled Checks Processor ──────────────────────────────
  await testAsync('Engine: processPendingScheduledChecks executes and completes mature scheduled checks', async () => {
    const mdb = await getDb();
    if (!mdb) {
      console.log('    (Skipping MongoDB-dependent test: DB not reachable)');
      return;
    }

    const matureJobId = `KFINTECH_MATURE_${Date.now()}`;
    // Insert a mature check whose scheduledFor is 10 seconds in the past
    await mdb.collection('ipo_scheduled_checks').insertOne({
      _id: matureJobId,
      symbol: 'MATURE_SYM',
      registrar: 'KFINTECH',
      ipoName: 'Mature IPO Ltd',
      scheduledFor: new Date(Date.now() - 10000), // In the past!
      status: 'PENDING',
      createdAt: new Date(),
    });

    const processRes = await processPendingScheduledChecks();
    assert.ok(processRes.processed >= 1, 'Processor must process at least 1 mature job');

    const updatedJob = await mdb.collection('ipo_scheduled_checks').findOne({ _id: matureJobId });
    assert.strictEqual(updatedJob.status, 'COMPLETED', 'Mature job status must be COMPLETED');
    assert.ok(updatedJob.completedAt, 'completedAt must be populated');

    // Clean up
    await mdb.collection('ipo_scheduled_checks').deleteOne({ _id: matureJobId });
  });

  // ── TEST 6: Ephemeral 24-Hour Deduplication Lock ─────────────────────────────
  await testAsync('Locking: 24-hour deduplication prevents duplicate runs unless force=true', async () => {
    const lockSymbol = `LOCK_TEST_${Date.now()}`;
    // First run (force: false)
    const run1 = await triggerAutoAllotmentCheck({
      symbol: lockSymbol,
      registrar: 'KFINTECH',
      ipoName: 'Lock Test Ltd',
      force: false,
    });
    assert.strictEqual(run1.success, true);

    // Second run immediately after without force
    const run2 = await triggerAutoAllotmentCheck({
      symbol: lockSymbol,
      registrar: 'KFINTECH',
      ipoName: 'Lock Test Ltd',
      force: false,
    });
    assert.strictEqual(run2.skipped, true, 'Second run must be skipped by 24h deduplication lock');
    assert.strictEqual(run2.reason, 'ALREADY_CHECKED');

    // Third run with force: true (must bypass lock)
    const run3 = await triggerAutoAllotmentCheck({
      symbol: lockSymbol,
      registrar: 'KFINTECH',
      ipoName: 'Lock Test Ltd',
      force: true,
    });
    assert.strictEqual(run3.success, true, 'Forced run must bypass 24h deduplication lock');
  });

  // ── TEST 7: Single-User On-Demand Family PAN Verification ───────────────────
  await testAsync('User API: checkUserFamilyPans returns structured summary for user', async () => {
    // Calling with non-existent or empty user returns empty array gracefully without error
    const result = await checkUserFamilyPans({
      uid: 'non_existent_test_uid',
      symbol: 'SAMPLE_SYM',
      registrar: 'KFINTECH',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 0);
    assert.strictEqual(result.summary.total, 0);
    assert.strictEqual(result.summary.allotted, 0);
    assert.strictEqual(result.summary.notAllotted, 0);
  });

  // ── TEST 8: Registrar Discovery Cadence Calculations ────────────────────────
  test('Cadence: istTime evaluates daytime and evening allotment windows', () => {
    const { isIpoAllotmentCheckWindow } = require('../lib/time/istTime');
    // Evening 21:00 IST on Wednesday (May 20, 2026 was Wednesday)
    const wednesdayNight = new Date('2026-05-20T15:30:00Z'); // 21:00 IST
    assert.strictEqual(isIpoAllotmentCheckWindow(wednesdayNight), true, 'Wednesday 21:00 IST must be inside allotment window');

    // Daytime 11:00 IST on Wednesday
    const wednesdayDay = new Date('2026-05-20T05:30:00Z'); // 11:00 IST
    assert.strictEqual(isIpoAllotmentCheckWindow(wednesdayDay), false, 'Wednesday 11:00 IST must be outside evening window (daytime cadence applies)');

    // Sunday evening
    const sundayNight = new Date('2026-05-24T15:30:00Z'); // 21:00 IST Sunday
    assert.strictEqual(isIpoAllotmentCheckWindow(sundayNight), false, 'Sunday night must be outside weekday allotment window');
  });

  // ── TEST 9: Express Route Mounting Verification ─────────────────────────────
  test('Route: ipoVerificationRoutes mounts /check-my-family handler', () => {
    const ipoRoutes = require('../routes/ipoVerificationRoutes');
    const mockVerifyToken = (req, res, next) => next();
    const router = ipoRoutes(mockVerifyToken);

    const routes = router.stack.map(layer => ({
      path: layer.route?.path,
      method: Object.keys(layer.route?.methods || {})[0],
    })).filter(r => r.path);

    const checkMyFamilyRoute = routes.find(r => r.path === '/check-my-family' && r.method === 'post');
    assert.ok(checkMyFamilyRoute, 'POST /check-my-family route must be mounted');
  });

  console.log(`\n🎉 ALL ${passed} TWO-STAGE IPO ALLOTMENT E2E TESTS PASSED!\n`);
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
