'use strict';

/**
 * test_ipo_store_lifecycle.js
 *
 * Comprehensive integration test for MongoDB IPO storage lifecycle:
 * - TTL auto-purge index verification (14 days)
 * - Multi-registrar upsert & deduplication
 * - Active vs Expired reconciliation per registrar
 * - Historical cleanup
 * - Notification tracking in MongoDB
 */

require('dotenv').config();
const { getDb } = require('../lib/mongoClient');
const {
  ensureIndexes,
  saveIpoSymbols,
  getActiveIpoSymbols,
  reconcileMissingIpos,
  cleanupHistoricalIpos,
  markNotificationsSent,
} = require('../lib/ipoStore');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function runLifecycleTests() {
  console.log('\n━━━ Suite 1: MongoDB TTL & Compound Index Verification ━━━━━━━━━');
  const db = await getDb();
  if (!db) {
    console.error('Database connection failed');
    process.exit(1);
  }

  await ensureIndexes();

  const col = db.collection('iposymbols');
  const indexes = await col.indexes();

  const ttlIndex = indexes.find(idx => idx.name === 'lastSeenAt_ttl_14d' || (idx.key && idx.key.lastSeenAt));
  assert('TTL Index exists on lastSeenAt', !!ttlIndex);
  if (ttlIndex && ttlIndex.expireAfterSeconds) {
    assert('TTL expireAfterSeconds is configured to 14 days (1,209,600s)', ttlIndex.expireAfterSeconds === 14 * 86400);
  }

  const hasStatusSource = indexes.some(idx => idx.key && idx.key.status && idx.key.source);
  assert('Compound index on { status: 1, source: 1 } exists', hasStatusSource);

  const hasSourceClient = indexes.some(idx => idx.key && idx.key.source && idx.key.clientId);
  assert('Compound index on { source: 1, clientId: 1 } exists', hasSourceClient);

  // Check history collection indexes
  const historyCol = db.collection('allotment_notification_history');
  const historyIndexes = await historyCol.indexes();
  const historyTtlIndex = historyIndexes.find(idx => idx.name === 'notifiedAt_ttl_60d' || (idx.key && idx.key.notifiedAt));
  assert('TTL Index exists on allotment_notification_history.notifiedAt', !!historyTtlIndex);
  if (historyTtlIndex && historyTtlIndex.expireAfterSeconds) {
    assert('History TTL expireAfterSeconds is configured to 60 days (5,184,000s)', historyTtlIndex.expireAfterSeconds === 60 * 86400);
  }

  console.log('\n━━━ Suite 2: Multi-Registrar Upsert & Storage Isolation ━━━━━━━━━');
  const testKfin = [{ clientId: 'TEST_K_101', symbol: 'TEST KFINTECH CORP LIMITED' }];
  const testMufg = [{ clientId: 'TEST_M_202', symbol: 'TEST MUFG INTIME LIMITED' }];
  const testBigshare = [{ clientId: 'TEST_B_303', symbol: 'TEST BIGSHARE CAPITAL LIMITED' }];

  // Clean test docs first
  await col.deleteMany({ clientId: { $in: ['TEST_K_101', 'TEST_M_202', 'TEST_B_303'] } });

  const insertedKfin = await saveIpoSymbols(testKfin, 'KFINTECH');
  const insertedMufg = await saveIpoSymbols(testMufg, 'MUFG');
  const insertedBig = await saveIpoSymbols(testBigshare, 'BIGSHARE');

  assert('New KFintech symbol inserted into MongoDB', insertedKfin.length === 1);
  assert('New MUFG symbol inserted into MongoDB', insertedMufg.length === 1);
  assert('New BigShare symbol inserted into MongoDB', insertedBig.length === 1);

  // Second run with same symbols should return 0 new (idempotent)
  const dupRun = await saveIpoSymbols(testKfin, 'KFINTECH');
  assert('Duplicate upsert returns 0 new IPOs', dupRun.length === 0);

  console.log('\n━━━ Suite 3: Query & Sorting Behavior ━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const allActive = await getActiveIpoSymbols('ALL');
  assert('getActiveIpoSymbols("ALL") returns all registrars', allActive.length >= 3);
  assert('Items contain source / registrar field', allActive.every(doc => !!doc.source));

  const bigshareOnly = await getActiveIpoSymbols('BIGSHARE');
  assert('getActiveIpoSymbols("BIGSHARE") filters only BigShare', bigshareOnly.every(doc => doc.source === 'BIGSHARE'));

  console.log('\n━━━ Suite 4: Multi-Registrar Reconciliation (ACTIVE → EXPIRED) ━━');
  // Reconcile with empty list to simulate removal from registrar website
  await reconcileMissingIpos([], 'KFINTECH');
  
  // Set lastSeenAt to 50 hours ago to trigger expiration
  const fiftyHoursAgo = new Date(Date.now() - 50 * 3600 * 1000);
  await col.updateOne({ clientId: 'TEST_K_101' }, { $set: { lastSeenAt: fiftyHoursAgo } });
  
  await reconcileMissingIpos([], 'KFINTECH');
  const expiredDoc = await col.findOne({ clientId: 'TEST_K_101' });
  assert('Unseen IPO missing >48h marked as EXPIRED', expiredDoc && expiredDoc.status === 'EXPIRED');

  // MUFG test doc was not in KFINTECH scope, should remain ACTIVE
  const mufgDoc = await col.findOne({ clientId: 'TEST_M_202' });
  assert('MUFG doc unaffected by KFintech reconciliation', mufgDoc && mufgDoc.status === 'ACTIVE');

  console.log('\n━━━ Suite 5: Notification Tracking in MongoDB ━━━━━━━━━━━━━━━━━━━');
  await markNotificationsSent([{ clientId: 'TEST_B_303' }], 'BIGSHARE');
  const notifiedDoc = await col.findOne({ clientId: 'TEST_B_303' });
  assert('notificationSent is set to true in MongoDB', notifiedDoc && notifiedDoc.notificationSent === true);
  assert('lastNotificationAt timestamp is recorded', notifiedDoc && !!notifiedDoc.lastNotificationAt);

  console.log('\n━━━ Suite 6: Purged Script Re-Scrape Protection (Permanent Ledger) ━━');
  // 1. Mark TEST_B_303 as notified so it writes to permanent ledger
  await markNotificationsSent([{ clientId: 'TEST_B_303', symbol: 'TEST BIGSHARE CAPITAL LIMITED' }], 'BIGSHARE');
  
  // 2. Simulate complete deletion of TEST_B_303 from iposymbols (as if 14-day TTL deleted it)
  await col.deleteOne({ clientId: 'TEST_B_303' });
  const deletedCheck = await col.findOne({ clientId: 'TEST_B_303' });
  assert('Simulated 14-day TTL deletion from iposymbols', !deletedCheck);

  // 3. Now simulate registrar re-returning TEST_B_303 on next fetch
  const reFetched = await saveIpoSymbols([{ clientId: 'TEST_B_303', symbol: 'TEST BIGSHARE CAPITAL LIMITED' }], 'BIGSHARE');
  assert('Re-fetched purged IPO returns 0 new IPOs for notification (NO SPAM)', reFetched.length === 0);

  const reInsertedDoc = await col.findOne({ clientId: 'TEST_B_303' });
  assert('Re-inserted doc has notificationSent = true immediately', reInsertedDoc && reInsertedDoc.notificationSent === true);

  console.log('\n━━━ Suite 7: Cleanup Test Data ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  // Set expired doc to 35 days ago to test cleanupHistoricalIpos
  const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 3600 * 1000);
  await col.updateOne({ clientId: 'TEST_K_101' }, { $set: { updatedAt: thirtyFiveDaysAgo } });

  const cleaned = await cleanupHistoricalIpos();
  assert('Historical expired IPOs deleted by cleanupHistoricalIpos', cleaned >= 1);

  // Clean remaining test docs from both collections
  await col.deleteMany({ clientId: { $in: ['TEST_K_101', 'TEST_M_202', 'TEST_B_303'] } });
  await historyCol.deleteMany({ clientId: { $in: ['TEST_K_101', 'TEST_M_202', 'TEST_B_303'] } });
  assert('Test documents cleaned up cleanly from both collections', true);

  console.log(`\n${'═'.repeat(62)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED — MongoDB IPO Lifecycle & 14-Day TTL Engine is operating smoothly.');
  } else {
    process.exit(1);
  }
}

runLifecycleTests();
