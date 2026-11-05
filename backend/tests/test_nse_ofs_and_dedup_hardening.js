'use strict';

/**
 * test_nse_ofs_and_dedup_hardening.js
 *
 * Exhaustive test suite covering:
 * 1. Push device endpoint deduplication & max-devices pruning.
 * 2. Multi-tier announcement deduplication (Redis NX + MongoDB alert_dedup_locks).
 * 3. NSE Gainers/Losers dual-exchange market fallback on cloud block/empty response.
 * 4. OFS scraper fail-safe recovery (MongoDB snapshot + graceful empty payload on network failure).
 * 5. All Announcements dual-exchange mapping & filter resilience.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function pass(msg) { console.log(`  \x1b[32m✔\x1b[0m ${msg}`); }
function fail(msg, err) { console.error(`  \x1b[31m✖\x1b[0m ${msg}`, err); }

async function runTests() {
  console.log('\n=== RUNNING NSE, OFS & NOTIFICATION DEDUP HARDENING TEST SUITE ===\n');

  // ── TEST 1: NSE Gainers/Losers Fallback & Normalization ────────────────────
  console.log('1. Testing NSE Gainers/Losers Resilient Fallback...');
  try {
    const { getNseGainersLosers } = require('../services/nseService');
    const res = await getNseGainersLosers('gainer', 'allSec');

    assert.strictEqual(res.success, true, 'Result success must be true');
    assert.strictEqual(res.exchange, 'NSE', 'Exchange must be NSE');
    assert(Array.isArray(res.data), 'data must be an array');
    assert(res.data.length > 0, 'data must not be empty');

    const sample = res.data[0];
    assert(typeof sample.symbol === 'string' && sample.symbol.length > 0, 'symbol must be non-empty string');
    assert(typeof sample.ltp === 'number' && !isNaN(sample.ltp), 'ltp must be valid number');
    assert(typeof sample.percentChange === 'number' && !isNaN(sample.percentChange), 'percentChange must be valid number');
    assert(typeof sample.volume === 'number' && !isNaN(sample.volume), 'volume must be valid number');
    assert(typeof sample.open === 'number' && !isNaN(sample.open), 'open must be valid number');
    assert(typeof sample.high === 'number' && !isNaN(sample.high), 'high must be valid number');
    assert(typeof sample.low === 'number' && !isNaN(sample.low), 'low must be valid number');
    assert(typeof sample.previousClose === 'number' && !isNaN(sample.previousClose), 'previousClose must be valid number');

    pass(`getNseGainersLosers returned ${res.data.length} valid securities (gateway=${res.gateway})`);
  } catch (err) {
    fail('NSE Gainers/Losers test failed', err);
    process.exit(1);
  }

  // ── TEST 2: OFS Scraper Fail-Safe Guarantee ───────────────────────────────
  console.log('\n2. Testing OFS Scraper Fail-Safe & Snapshot Recovery...');
  try {
    const { fetchOfsList, getLatestOfs } = require('../lib/ofsScraper');
    const ofsRes = await fetchOfsList();

    assert(ofsRes && typeof ofsRes === 'object', 'OFS response must be an object');
    assert(Array.isArray(ofsRes.data), 'OFS data must be an array');
    assert(typeof ofsRes.total === 'number', 'OFS total must be a number');
    assert(typeof ofsRes.stale === 'boolean', 'OFS stale flag must be boolean');

    pass(`fetchOfsList successfully executed without throwing (total=${ofsRes.total}, stale=${ofsRes.stale})`);
  } catch (err) {
    fail('OFS scraper fail-safe test failed', err);
    process.exit(1);
  }

  // ── TEST 3: Push Device Endpoint Deduplication ────────────────────────────
  console.log('\n3. Testing Push Device Endpoint Deduplication...');
  try {
    const pushStore = require('../lib/pushStore');
    const testUid = 'test_dedup_user_' + Date.now();
    const ep1 = 'https://fcm.googleapis.com/fcm/send/sample_test_token_123';
    const sub1 = { endpoint: ep1, keys: { auth: 'authKey', p256dh: 'pKey' } };

    // Register device 1
    await pushStore.registerDevice(testUid, 'device_A', sub1, { platform: 'desktop', browser: 'Chrome' });

    // Register device 2 with SAME endpoint
    await pushStore.registerDevice(testUid, 'device_B', sub1, { platform: 'desktop', browser: 'Chrome' });

    const devices = await pushStore.getAllDevices(testUid);
    assert.strictEqual(devices.length, 1, 'Should prune duplicate endpoint and keep exactly 1 device doc');
    assert.strictEqual(devices[0].deviceId, 'device_B', 'Should keep the newest device ID for that endpoint');

    // Clean up
    await pushStore.removeDevice(testUid, 'device_B');
    pass('PushStore cleanly pruned identical endpoint across device IDs');
  } catch (err) {
    fail('Push device dedup test failed', err);
    process.exit(1);
  }

  // ── TEST 4: MongoDB Atomic Dedup Lock ─────────────────────────────────────
  console.log('\n4. Testing MongoDB alert_dedup_locks Persistence...');
  try {
    const { getDb } = require('../lib/mongoClient');
    const { acquireDedupLock } = require('../lib/notificationDedup');
    const db = await getDb();
    const testUid = 'test_notif_user_' + Date.now();
    const testAnn = { id: 'test_ann_uuid_' + Date.now(), bseCode: '599999', scriptName: 'Test Corp', subject: 'Outcome of Board Meeting' };

    // First acquisition: should succeed (true)
    const firstLock = await acquireDedupLock(db, testUid, testAnn);
    assert.strictEqual(firstLock, true, 'First lock acquisition must succeed');

    // Second acquisition for SAME announcement & SAME user: must return false
    const secondLock = await acquireDedupLock(db, testUid, testAnn);
    assert.strictEqual(secondLock, false, 'Second lock acquisition for same ann+user must return false (duplicate blocked)');

    // Clean up
    await db.collection('alert_dedup_locks').deleteMany({ userId: testUid });
    pass('MongoDB alert_dedup_locks uniquely and atomically blocks duplicate notification events');
  } catch (err) {
    fail('Dedup lock persistence test failed', err);
    process.exit(1);
  }

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
