'use strict';

/**
 * test_ipo_closing_mongodb.js
 *
 * Automated verification test for the MongoDB-backed IPO Closing Notification Pipeline.
 */

const assert = require('assert');
require('../lib/firebaseAdmin');
const ipoClosingStore = require('../lib/ipoClosingStore');
const { getISTDateString } = require('../lib/time/istTime');
const { sendTelegramIpoClosingAlert } = require('../lib/telegramNotifier');

async function runMongoIpoClosingTests() {
  console.log('🧪 Running MongoDB-Backed IPO Closing Notification Test Suite...\n');

  const testDate = '2099-12-31';

  // 1. Wipe test collection
  console.log('Test 1: Wipe IPO closing collection');
  await ipoClosingStore.wipeTodayClosingIpos();
  const emptySummary = await ipoClosingStore.getClosingIposSummary(testDate);
  assert.strictEqual(emptySummary.total, 0, 'Collection must be empty after wipe');
  console.log('  ✅ PASS: Collection wiped cleanly.\n');

  // 2. Sync / Ingest IPOs
  console.log('Test 2: Sync Closing IPOs into MongoDB');
  const mockIpos = [
    { id: 'IPO-1', name: 'Alpha Tech', slug: 'alpha-tech', gmp: 10, gmpPercentage: 15, issuePrice: 100, exchange: 'Mainboard', closeDate: '31 Dec 2099', closeDateISO: testDate },
    { id: 'IPO-2', name: 'Beta Energy', slug: 'beta-energy', gmp: 50, gmpPercentage: 80, issuePrice: 50, exchange: 'Mainboard', closeDate: '31 Dec 2099', closeDateISO: testDate },
    { id: 'IPO-3', name: 'Gamma Infra', slug: 'gamma-infra', gmp: 5, gmpPercentage: 5, issuePrice: 200, exchange: 'SME', closeDate: '31 Dec 2099', closeDateISO: testDate },
  ];

  const syncRes = await ipoClosingStore.syncTodayClosingIpos(mockIpos, testDate);
  assert.strictEqual(syncRes.synced, 3, 'Must sync 3 new IPOs');

  const summaryAfterSync = await ipoClosingStore.getClosingIposSummary(testDate);
  assert.strictEqual(summaryAfterSync.total, 3, 'Must have 3 items total');
  assert.strictEqual(summaryAfterSync.pending, 3, 'All 3 items must be PENDING');
  console.log('  ✅ PASS: 3 IPOs successfully ingested with PENDING status.\n');

  // 3. Claim highest GMP% IPO
  console.log('Test 3: Atomic Claim Highest GMP% IPO');
  const claimed1 = await ipoClosingStore.getNextPendingClosingIpo(testDate);
  assert(claimed1, 'Must successfully claim an IPO');
  assert.strictEqual(claimed1.ipoId, 'IPO-2', 'Highest GMP% (80%) must be claimed first (Beta Energy)');
  assert.strictEqual(claimed1.dispatchStatus, 'DISPATCHING', 'Status must transition to DISPATCHING');
  console.log(`  ✅ PASS: Highest GMP% IPO claimed: "${claimed1.name}" (+${claimed1.gmpPercentage}%)\n`);

  // 4. Mark Completed with Delivered Users
  console.log('Test 4: Mark Completed with Delivered Users');
  await ipoClosingStore.markClosingIpoCompleted('IPO-2', testDate, ['uid-user-1', 'uid-user-2']);
  const summaryAfterComplete = await ipoClosingStore.getClosingIposSummary(testDate);
  assert.strictEqual(summaryAfterComplete.completed, 1, 'Completed count must be 1');
  assert.strictEqual(summaryAfterComplete.pending, 2, 'Pending count must be 2');
  console.log('  ✅ PASS: IPO-2 marked COMPLETED with delivered user array.\n');

  // 5. Subsequent Claim
  console.log('Test 5: Subsequent Claim Gets Next Highest GMP%');
  const claimed2 = await ipoClosingStore.getNextPendingClosingIpo(testDate);
  assert(claimed2, 'Must claim next IPO');
  assert.strictEqual(claimed2.ipoId, 'IPO-1', 'Next highest GMP% (15%) must be claimed (Alpha Tech)');
  console.log(`  ✅ PASS: Next highest GMP% IPO claimed: "${claimed2.name}" (+${claimed2.gmpPercentage}%)\n`);

  // 6. Telegram Formatter Validation
  console.log('Test 6: Telegram Alert Handler');
  assert(typeof sendTelegramIpoClosingAlert === 'function', 'sendTelegramIpoClosingAlert must be exported');
  const testTg = await sendTelegramIpoClosingAlert(claimed1, '');
  assert.strictEqual(testTg.sent, false, 'Unconfigured chatId must return sent: false cleanly');
  assert.strictEqual(testTg.reason, 'not_configured');
  console.log('  ✅ PASS: Telegram alert handler validated cleanly.\n');

  // 7. Cleanup
  console.log('Test 7: Cleanup test data');
  await ipoClosingStore.wipeTodayClosingIpos();
  console.log('  ✅ PASS: Test collection cleaned up.\n');

  console.log('🎉 ALL MONGODB-BACKED IPO CLOSING TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runMongoIpoClosingTests().catch((err) => {
  console.error('❌ FAIL: Test failed:', err);
  process.exit(1);
});
