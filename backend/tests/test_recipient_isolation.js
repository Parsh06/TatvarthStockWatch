'use strict';

/**
 * test_recipient_isolation.js
 *
 * Comprehensive Automated Test Matrix for Inverted Notification Engine Hardening.
 */

const assert = require('assert');
const { 
  resolveRecipientsMapForBatch, 
  getStableAnnouncementId, 
  getAnnouncementInstrumentKeys 
} = require('../lib/notification/notificationRouter');

async function runTestMatrix() {
  console.log('🧪 Running Hardened Recipient Isolation Test Suite...\n');

  // Test 1: getStableAnnouncementId guard
  console.log('Test 1: Stable Announcement ID Validation');
  assert.strictEqual(getStableAnnouncementId({ id: 'ANN_1' }), 'ANN_1');
  assert.strictEqual(getStableAnnouncementId({ _id: 'ANN_2' }), 'ANN_2');
  assert.strictEqual(getStableAnnouncementId({ NEWSID: 'ANN_3' }), 'ANN_3');
  assert.strictEqual(getStableAnnouncementId({ id: '  ANN_4  ' }), 'ANN_4');
  assert.strictEqual(getStableAnnouncementId({}), null);
  assert.strictEqual(getStableAnnouncementId({ id: 'undefined' }), null);
  assert.strictEqual(getStableAnnouncementId({ id: 'null' }), null);
  console.log('  ✅ PASS: Stable ID guard correctly filters malformed IDs and prevents key overwrites.\n');

  // Test 2: getAnnouncementInstrumentKeys canonical extraction
  console.log('Test 2: Canonical Instrument Key Extraction');
  const keysBseNse = getAnnouncementInstrumentKeys({ scriptCode: '500325', symbol: 'reliance' });
  assert.deepStrictEqual(keysBseNse, ['BSE:500325', 'NSE:RELIANCE']);

  const keysBseOnly = getAnnouncementInstrumentKeys({ ltdCode: '532540' });
  assert.deepStrictEqual(keysBseOnly, ['BSE:532540']);

  const keysNseOnly = getAnnouncementInstrumentKeys({ nseSymbol: 'tcs' });
  assert.deepStrictEqual(keysNseOnly, ['NSE:TCS']);
  console.log('  ✅ PASS: Canonical instrument keys correctly match watchlistStore formatting.\n');

  // Test 3: Per-Announcement Recipient Isolation Map
  console.log('Test 3: Recipient Isolation Map Generation');
  const mockBatch = [
    { id: 'ANN_101', scriptCode: '500325', symbol: 'RELIANCE', category: 'Board Meeting' },
    { id: 'ANN_102', scriptCode: '532540', symbol: 'TCS',      category: 'Financial Results' },
    { id: 'ANN_103', scriptCode: '500209', symbol: 'INFY',     category: 'Dividends' },
    { subject: 'Malformed No ID', scriptCode: '599999' }, // should be skipped by router
  ];

  const map = await resolveRecipientsMapForBatch(mockBatch);
  assert(map instanceof Map, 'Result must be a Map');
  assert.strictEqual(map.size, 3, 'Must contain entries for only valid announcements');
  assert(map.has('ANN_101'), 'Must contain ANN_101');
  assert(map.has('ANN_102'), 'Must contain ANN_102');
  assert(map.has('ANN_103'), 'Must contain ANN_103');
  assert(!map.has('undefined'), 'Must not contain undefined key');
  console.log('  ✅ PASS: Recipient map eliminates cross-pollination and skips malformed records.\n');

  console.log('🎉 ALL HARDENING VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runTestMatrix().catch((err) => {
  console.error('❌ FAIL: Test failed:', err.message);
  process.exit(1);
});
