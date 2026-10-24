'use strict';

/**
 * test_ipo_check_history_and_midnight_wipe.js
 *
 * Automated Test Suite for Ephemeral IPO Allotment Check History & Midnight Wipeout
 *
 * Verifies:
 * 1. Interface exports from ipoCheckHistoryStore.
 * 2. saveCheckHistory saves records with normalized fields, status, and summary.
 * 3. Deduplication / upsert by uid_registrar_symbol keeps DB clean on repeat checks.
 * 4. Distinct users are partitioned properly.
 * 5. getUserCheckHistory returns user records in descending order of updatedAt.
 * 6. clearUserCheckHistory clears only caller's history.
 * 7. wipeAllCheckHistory clears all records for midnight wipeout.
 * 8. performMidnightWipeIfNeeded in cronService triggers check history wipe.
 * 9. ipoVerificationRoutes mounts /history GET, POST, and DELETE endpoints.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { 
  saveCheckHistory, 
  getUserCheckHistory, 
  clearUserCheckHistory, 
  wipeAllCheckHistory 
} = require('../lib/ipoCheckHistoryStore');

async function runTests() {
  console.log('\n=== RUNNING IPO CHECK HISTORY & MIDNIGHT WIPEOUT E2E TESTS ===\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  const testUid1 = `test_user_hist_${Date.now()}_1`;
  const testUid2 = `test_user_hist_${Date.now()}_2`;

  await test('Interface: All required check history functions are exported', () => {
    assert.strictEqual(typeof saveCheckHistory, 'function');
    assert.strictEqual(typeof getUserCheckHistory, 'function');
    assert.strictEqual(typeof clearUserCheckHistory, 'function');
    assert.strictEqual(typeof wipeAllCheckHistory, 'function');
  });

  await test('Storage: saveCheckHistory creates normalized record for manual check', async () => {
    const saved = await saveCheckHistory({
      uid: testUid1,
      symbol: 'TESTIPO',
      ipoName: 'Test IPO Ltd',
      registrar: 'KFINTECH',
      type: 'MANUAL',
      results: [
        {
          id: 'app_1',
          name: 'Alice Jain',
          maskedPan: 'XXXXXX1234',
          sharesAllotted: 50,
          appliedShares: 50,
          dpId: 'IN30012312345678',
          appNo: 'APP987654',
          category: 'Retail',
        },
        {
          id: 'app_2',
          name: 'Bob Jain',
          maskedPan: 'XXXXXX5678',
          sharesAllotted: 0,
          appliedShares: 50,
          status: 'not_allotted',
          dpId: '1201230000000001',
          appNo: 'APP987655',
          category: 'Retail',
        },
        {
          id: 'app_3',
          name: 'Charlie Jain',
          maskedPan: 'XXXXXX9012',
          status: 'not_found',
        }
      ]
    });

    assert.ok(saved, 'Record must be saved');
    assert.strictEqual(saved.uid, testUid1);
    assert.strictEqual(saved.symbol, 'TESTIPO');
    assert.strictEqual(saved.type, 'MANUAL');
    assert.strictEqual(saved.summary.total, 3);
    assert.strictEqual(saved.summary.allotted, 1);
    assert.strictEqual(saved.summary.notAllotted, 1);
    assert.strictEqual(saved.summary.notFound, 1);
  });

  await test('Storage: saveCheckHistory creates record for automated check', async () => {
    const saved = await saveCheckHistory({
      uid: testUid1,
      symbol: 'AUTOTECH',
      ipoName: 'Auto Tech Systems Ltd',
      registrar: 'BIGSHARE',
      type: 'AUTO',
      results: [
        {
          id: 'app_1',
          name: 'Alice Jain',
          maskedPan: 'XXXXXX1234',
          sharesAllotted: 0,
          appliedShares: 0,
          status: 'not_found',
        }
      ]
    });

    assert.ok(saved);
    assert.strictEqual(saved.type, 'AUTO');
    assert.strictEqual(saved.registrar, 'BIGSHARE');
  });

  await test('Retrieval: getUserCheckHistory returns user records sorted by updatedAt', async () => {
    const history = await getUserCheckHistory(testUid1);
    assert.ok(Array.isArray(history));
    assert.strictEqual(history.length, 2);
    // AUTOTECH was saved second, so it should be first
    assert.strictEqual(history[0].symbol, 'AUTOTECH');
    assert.strictEqual(history[1].symbol, 'TESTIPO');
  });

  await test('Deduplication: Repeat check for same IPO updates existing doc without duplicates', async () => {
    await saveCheckHistory({
      uid: testUid1,
      symbol: 'TESTIPO',
      ipoName: 'Test IPO Ltd (Updated)',
      registrar: 'KFINTECH',
      type: 'MANUAL',
      results: [
        {
          id: 'app_1',
          name: 'Alice Jain',
          maskedPan: 'XXXXXX1234',
          sharesAllotted: 100,
          appliedShares: 100,
        }
      ]
    });

    const history = await getUserCheckHistory(testUid1);
    assert.strictEqual(history.length, 2, 'Should still have 2 records (no duplicates)');
    const testIpo = history.find(h => h.symbol === 'TESTIPO');
    assert.ok(testIpo);
    assert.strictEqual(testIpo.results[0].sharesAllotted, 100);
  });

  await test('Chunk Merging: 13 family applicants split across 3 chunks accumulate additively', async () => {
    const chunk1 = Array.from({ length: 5 }, (_, i) => ({
      applicantId: `app_${i + 1}`,
      name: `Member ${i + 1}`,
      maskedPan: `XXXXXX${i + 1}00A`,
      sharesAllotted: 0,
      appliedShares: 1449,
      status: 'not_allotted'
    }));

    const chunk2 = Array.from({ length: 5 }, (_, i) => ({
      applicantId: `app_${i + 6}`,
      name: `Member ${i + 6}`,
      maskedPan: `XXXXXX${i + 6}00B`,
      sharesAllotted: 0,
      appliedShares: 1449,
      status: 'not_allotted'
    }));

    const chunk3 = [
      {
        applicantId: 'app_11',
        name: 'Mayur HUF',
        maskedPan: 'XXXXXX639F',
        sharesAllotted: 0,
        appliedShares: 0,
        status: 'not_found'
      },
      {
        applicantId: 'app_12',
        name: 'Pukhraj HUF',
        maskedPan: 'XXXXXX537K',
        sharesAllotted: 0,
        appliedShares: 294,
        status: 'not_allotted'
      },
      {
        applicantId: 'app_13',
        name: 'Saloni',
        maskedPan: 'XXXXXX454F',
        sharesAllotted: 0,
        appliedShares: 21,
        status: 'not_allotted'
      }
    ];

    // Dispatch Chunk 1
    await saveCheckHistory({
      uid: testUid1,
      symbol: '15211216041',
      ipoName: 'TONBO IMAGING INDIA LIMITED',
      registrar: 'KFINTECH',
      type: 'MANUAL',
      results: chunk1
    });

    // Dispatch Chunk 2
    await saveCheckHistory({
      uid: testUid1,
      symbol: '15211216041',
      ipoName: 'TONBO IMAGING INDIA LIMITED',
      registrar: 'KFINTECH',
      type: 'MANUAL',
      results: chunk2
    });

    // Dispatch Chunk 3
    await saveCheckHistory({
      uid: testUid1,
      symbol: '15211216041',
      ipoName: 'TONBO IMAGING INDIA LIMITED',
      registrar: 'KFINTECH',
      type: 'MANUAL',
      results: chunk3
    });

    const userHist = await getUserCheckHistory(testUid1);
    const tonboDoc = userHist.find(h => h.symbol === '15211216041');
    assert.ok(tonboDoc, 'TONBO IMAGING doc must exist');
    assert.strictEqual(tonboDoc.ipoName, 'TONBO IMAGING INDIA LIMITED');
    assert.strictEqual(tonboDoc.results.length, 13, 'All 13 chunked applicants must be merged without loss');
    assert.strictEqual(tonboDoc.summary.total, 13);
    assert.strictEqual(tonboDoc.summary.allotted, 0);
    assert.strictEqual(tonboDoc.summary.notAllotted, 12);
    assert.strictEqual(tonboDoc.summary.notFound, 1);
  });

  await test('Isolation: Other user check records are isolated', async () => {
    await saveCheckHistory({
      uid: testUid2,
      symbol: 'OTHERIPO',
      ipoName: 'Other IPO Ltd',
      registrar: 'MUFG',
      type: 'MANUAL',
      results: []
    });

    const user1Hist = await getUserCheckHistory(testUid1);
    const user2Hist = await getUserCheckHistory(testUid2);

    assert.strictEqual(user1Hist.length, 3);
    assert.strictEqual(user2Hist.length, 1);
    assert.strictEqual(user2Hist[0].symbol, 'OTHERIPO');
  });

  await test('Clear: clearUserCheckHistory removes only specified user records', async () => {
    const cleared = await clearUserCheckHistory(testUid1);
    assert.strictEqual(cleared, 3);

    const user1After = await getUserCheckHistory(testUid1);
    assert.strictEqual(user1After.length, 0);

    const user2After = await getUserCheckHistory(testUid2);
    assert.strictEqual(user2After.length, 1, 'User 2 records must remain intact');
  });

  await test('Midnight Wipe: wipeAllCheckHistory wipes all history across all users', async () => {
    const wiped = await wipeAllCheckHistory();
    assert.ok(wiped >= 1);

    const user2After = await getUserCheckHistory(testUid2);
    assert.strictEqual(user2After.length, 0, 'All records must be wiped');
  });

  await test('Cron Integration: performMidnightWipeIfNeeded source includes wipeAllCheckHistory', () => {
    const fs = require('fs');
    const cronContent = fs.readFileSync(path.join(__dirname, '../services/cronService.js'), 'utf8');
    assert.ok(cronContent.includes('wipeAllCheckHistory'), 'cronService must include wipeAllCheckHistory');
  });

  await test('Routing: ipoVerificationRoutes mounts /history GET, POST, and DELETE endpoints', () => {
    const ipoVerificationRoutes = require('../routes/ipoVerificationRoutes');
    const dummyVerifyToken = (req, res, next) => next();
    const router = ipoVerificationRoutes(dummyVerifyToken);

    const routes = [];
    router.stack.forEach(layer => {
      if (layer.route) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods);
        methods.forEach(m => routes.push({ path, method: m }));
      }
    });

    const getHist = routes.find(r => r.path === '/history' && r.method === 'get');
    const postHist = routes.find(r => r.path === '/history' && r.method === 'post');
    const deleteHist = routes.find(r => r.path === '/history' && r.method === 'delete');

    assert.ok(getHist, 'GET /history must be mounted');
    assert.ok(postHist, 'POST /history must be mounted');
    assert.ok(deleteHist, 'DELETE /history must be mounted');
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().then(() => {
  console.log('Test execution completed.');
  process.exit(0);
}).catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
