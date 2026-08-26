'use strict';

/**
 * test_ipo_closing_hardened.js
 *
 * Automated verification test for the hardened IPO Closing Notification pipeline.
 */

const assert = require('assert');
require('../lib/firebaseAdmin'); // Initialize Firebase Admin SDK for tests
const { getISTDateTime, getISTDateString, parseToISTDateString, isWithinIpoDispatchWindow } = require('../lib/time/istTime');
const { processIpoClosingQueueTick } = require('../lib/ipoClosingNotificationService');
const { getIposClosingToday } = require('../services/ipoService');

const redisNotifStore = require('../lib/redis/redisNotificationStore');

async function runTestMatrix() {
  console.log('🧪 Running Hardened IPO Closing Notification Test Suite...\n');

  // Test 1: Timezone Asia/Kolkata calculation
  console.log('Test 1: Asia/Kolkata Timezone Utility');
  const nowParts = getISTDateTime();
  assert(nowParts.dateIST.match(/^\d{4}-\d{2}-\d{2}$/), 'dateIST must be YYYY-MM-DD');
  assert(nowParts.istHour >= 0 && nowParts.istHour <= 23, 'istHour must be 0-23');
  assert(nowParts.istMinute >= 0 && nowParts.istMinute <= 59, 'istMinute must be 0-59');
  console.log(`  ✅ PASS: IST Date: ${nowParts.dateIST}, Hour: ${nowParts.istHour}, Minute: ${nowParts.istMinute}\n`);

  // Test 2: ISO Date String Normalization
  console.log('Test 2: Date Parsing & Normalization');
  assert.strictEqual(parseToISTDateString('2026-08-26'), '2026-08-26');
  assert.strictEqual(parseToISTDateString('26 Aug 2026'), '2026-08-26');
  assert.strictEqual(parseToISTDateString('26-Aug-2026'), '2026-08-26');
  assert.strictEqual(parseToISTDateString('invalid'), null);
  console.log('  ✅ PASS: Scraped dates normalize cleanly to ISO YYYY-MM-DD in IST.\n');

  // Test 3: Structured status response from getIposClosingToday()
  console.log('Test 3: getIposClosingToday Contract & Scraper Isolation');
  const fetchResult = await getIposClosingToday();
  assert(typeof fetchResult.ok === 'boolean', 'fetchResult.ok must be boolean');
  assert(Array.isArray(fetchResult.ipos), 'fetchResult.ipos must be an Array');
  assert(['SUCCESS', 'PARTIAL_SUCCESS', 'UPSTREAM_FAILURE'].includes(fetchResult.status), 'Status must be valid enum');
  console.log(`  ✅ PASS: Contract returned status=${fetchResult.status}, ipos.length=${fetchResult.ipos.length}\n`);

  // Test 4: Queue State Machine & Owner Token Validation
  console.log('Test 4: Queue State Machine & Owner Token Validation');
  const testDate = '2099-01-01';
  const testIpo  = { id: 'TEST-999', name: 'Test Hardened IPO', gmp: 50, gmpPercentage: 10 };
  
  await redisNotifStore.populateIpoClosingQueue(testDate, [testIpo]);
  
  // Worker A claims item
  const recordA = await redisNotifStore.claimNextIpoForProcessing(testDate, 'WORKER-A', 1000);
  assert(recordA !== null, 'Worker A must successfully claim item');
  assert.strictEqual(recordA.ownerToken, 'WORKER-A');
  console.log('  subtest 4a: Worker A successfully claimed item into PROCESSING hash.');

  // Worker B attempts completion with wrong token (must fail)
  const rejectedCompletion = await redisNotifStore.markIpoCompleted(testDate, 'TEST-999', 'WORKER-B');
  assert.strictEqual(rejectedCompletion, false, 'Worker B must be rejected due to ownerToken mismatch');
  console.log('  subtest 4b: Worker B completion attempt cleanly rejected due to ownerToken mismatch.');

  // Worker A extends lease
  const renewed = await redisNotifStore.renewLease(testDate, 'TEST-999', 'WORKER-A', 60000);
  assert.strictEqual(renewed, true, 'Worker A must successfully renew lease');
  console.log('  subtest 4c: Worker A lease heartbeat renewal succeeded.');

  // Worker A marks completed
  const completed = await redisNotifStore.markIpoCompleted(testDate, 'TEST-999', 'WORKER-A');
  assert.strictEqual(completed, true, 'Worker A must successfully mark item completed');
  console.log('  ✅ PASS: Queue state machine & owner token validation verified.\n');

  // Test 5: Queue Status Diagnostics Contract
  console.log('Test 5: Queue Diagnostics Contract');
  const statusObj = await redisNotifStore.getIpoClosingQueueStatus(testDate);
  assert(typeof statusObj === 'object', 'Status output must be object');
  assert(statusObj.completedCount >= 1, 'Completed count must reflect test completion');
  console.log('  ✅ PASS: Diagnostics status:', JSON.stringify(statusObj, null, 2), '\n');

  // Test 6: Force Mode Queue Tick Execution
  console.log('Test 6: Force Mode Queue Tick Execution');
  const tickStats = await processIpoClosingQueueTick({ force: true });
  assert(typeof tickStats === 'object', 'tickStats must be an object');
  console.log('  ✅ PASS: Queue tick processed cleanly:', JSON.stringify(tickStats, null, 2));

  console.log('\n🎉 ALL IPO CLOSING HARDENING TESTS PASSED SUCCESSFULLY!');
}

runTestMatrix().catch((err) => {
  console.error('❌ FAIL: Test failed with error:', err.message);
  process.exit(1);
});
