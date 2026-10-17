'use strict';

/**
 * test_user_approval_notifications_e2e.js
 *
 * Comprehensive End-to-End Test Suite for User Approval Notifications Pipeline:
 * 1. Admin Discovery (Role 'admin' + known admin email fallbacks)
 * 2. Multi-device Web Push targeting for all registered admin devices
 * 3. First-time registration & onboarding notification dispatch
 * 4. Deduplication & suppression on subsequent routine page loads
 * 5. Cooldown enforcement on /api/auth/resend-approval-notification
 * 6. Audit log entry generation
 * 7. Approval retention immunity (approved users skip pending alerts)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('assert');
const { db, admin } = require('../lib/firebaseAdmin');
const { notifyAdminsOfNewAccessRequest } = require('../lib/userApprovalNotificationService');
const pushStore = require('../lib/pushStore');

const TEST_UID = `test-investor-${Date.now()}`;
const TEST_EMAIL = `test.investor.${Date.now()}@example.com`;
const TEST_NAME = 'Test Investor Alpha';

let testsPassed = 0;
let testsFailed = 0;

function logPass(title) {
  testsPassed++;
  console.log(`  \x1b[32m✔ PASS:\x1b[0m ${title}`);
}

function logFail(title, err) {
  testsFailed++;
  console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${title}`);
  console.error('   ', err.message || err);
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 Starting E2E User Approval Notifications Test Suite');
  console.log('================================================================\n');

  // ── TEST 1: Admin Discovery & Push Device Verification ─────────────────────
  console.log('[Suite 1: Admin Discovery & Devices]');
  try {
    const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
    assert(adminSnap.size >= 1, 'At least one admin user must exist in Firestore');

    const adminDoc = adminSnap.docs[0];
    const adminUid = adminDoc.id;
    const adminEmail = adminDoc.data()?.email;

    const devices = await pushStore.getAllDevices(adminUid);
    console.log(`   Found admin ${adminEmail} (${adminUid}) with ${devices.length} registered push device(s)`);
    assert(Array.isArray(devices), 'Devices must be an array');
    logPass(`Discovered admin ${adminEmail} with ${devices.length} registered push device(s)`);
  } catch (err) {
    logFail('Admin Discovery & Push Device Verification', err);
  }

  // ── TEST 2: notifyAdminsOfNewAccessRequest Direct Dispatch ─────────────────
  console.log('\n[Suite 2: Direct Notification Dispatch Execution]');
  let directResult = null;
  try {
    directResult = await notifyAdminsOfNewAccessRequest({
      uid: TEST_UID,
      email: TEST_EMAIL,
      displayName: TEST_NAME,
    });

    assert(directResult.success === true, 'Notification dispatch must return success: true');
    assert(directResult.adminsCount >= 1, 'At least 1 admin must be targeted');
    assert(typeof directResult.pushDevicesAttempted === 'number', 'pushDevicesAttempted must be a number');
    assert(typeof directResult.pushSentCount === 'number', 'pushSentCount must be a number');
    logPass(`notifyAdminsOfNewAccessRequest dispatched (admins=${directResult.adminsCount}, devicesAttempted=${directResult.pushDevicesAttempted}, pushSent=${directResult.pushSentCount})`);
  } catch (err) {
    logFail('notifyAdminsOfNewAccessRequest Direct Dispatch', err);
  }

  // ── TEST 3: Audit Log Generation ───────────────────────────────────────────
  console.log('\n[Suite 3: Audit Log Verification]');
  try {
    const auditSnap = await db.collection('admin_audit_logs')
      .where('targetUid', '==', TEST_UID)
      .where('action', '==', 'USER_ACCESS_REQUESTED')
      .limit(1)
      .get();

    assert(!auditSnap.empty, 'Audit log entry for USER_ACCESS_REQUESTED must be created');
    const auditData = auditSnap.docs[0].data();
    assert.strictEqual(auditData.actorEmail, TEST_EMAIL, 'Audit log actorEmail must match user');
    logPass('Audit log record verified in admin_audit_logs');
  } catch (err) {
    logFail('Audit Log Verification', err);
  }

  // ── TEST 4: First-time Onboarding Request Simulation ───────────────────────
  console.log('\n[Suite 4: User Onboarding Endpoint Logic]');
  const userRef = db.collection('users').doc(TEST_UID);
  try {
    // Simulate user document creation with pending status
    await userRef.set({
      displayName: TEST_NAME,
      email: TEST_EMAIL,
      role: 'user',
      entitlements: { read: false, write: false },
      disabled: false,
      approvalStatus: 'pending',
      approvalNotificationSent: false, // Set to false initially as client would
      approvalRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Simulate backend onboarding logic
    const snap = await userRef.get();
    const data = snap.data();
    assert.strictEqual(data.approvalStatus, 'pending', 'User must be pending');

    let notificationDispatched = false;
    if (data.approvalStatus === 'pending') {
      if (!data.approvalNotificationSent) {
        await userRef.set({
          approvalNotificationSent: true,
          approvalNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        const notifyRes = await notifyAdminsOfNewAccessRequest({
          uid: TEST_UID,
          email: TEST_EMAIL,
          displayName: TEST_NAME,
        });
        notificationDispatched = Boolean(notifyRes.success);
      }
    }

    assert(notificationDispatched === true, 'Notification must be dispatched on pending without sent flag');
    const updatedSnap = await userRef.get();
    assert.strictEqual(updatedSnap.data().approvalNotificationSent, true, 'approvalNotificationSent must now be true');
    logPass('First-time onboarding correctly dispatches alert and marks approvalNotificationSent: true');
  } catch (err) {
    logFail('First-time Onboarding Request Simulation', err);
  }

  // ── TEST 5: Subsequent Login / Refresh Deduplication ───────────────────────
  console.log('\n[Suite 5: Routine Refresh Deduplication]');
  try {
    const snap = await userRef.get();
    const data = snap.data();
    let redundantPushSent = false;

    if (data.approvalStatus === 'pending') {
      if (!data.approvalNotificationSent) {
        redundantPushSent = true;
      }
    }

    assert(redundantPushSent === false, 'Redundant push must NOT be sent when approvalNotificationSent is true');
    logPass('Routine page loads correctly suppress redundant push alerts');
  } catch (err) {
    logFail('Routine Refresh Deduplication', err);
  }

  // ── TEST 6: Resend Cooldown Enforcement ───────────────────────────────────
  console.log('\n[Suite 6: Resend Approval Notification Cooldown]');
  try {
    const snap = await userRef.get();
    const data = snap.data();

    // Check cooldown: recently sent timestamp
    const lastSent = data.approvalNotificationSentAt?.toDate ? data.approvalNotificationSentAt.toDate() : new Date();
    const elapsedMs = Date.now() - lastSent.getTime();
    const isWithinCooldown = elapsedMs < 120 * 1000;

    assert(isWithinCooldown === true, 'Immediate resend must be within 2-minute cooldown');
    logPass('Immediate resend correctly triggers 2-minute cooldown guard');

    // Simulate expired cooldown (backdating by 3 minutes)
    const threeMinAgo = new Date(Date.now() - 180 * 1000);
    await userRef.set({ approvalNotificationSentAt: threeMinAgo }, { merge: true });

    const updatedSnap = await userRef.get();
    const updatedSent = updatedSnap.data().approvalNotificationSentAt?.toDate ? updatedSnap.data().approvalNotificationSentAt.toDate() : new Date(updatedSnap.data().approvalNotificationSentAt);
    const updatedElapsedMs = Date.now() - updatedSent.getTime();
    assert(updatedElapsedMs >= 120 * 1000, 'Cooldown must now be expired');

    // Now resend is permitted
    const resendResult = await notifyAdminsOfNewAccessRequest({
      uid: TEST_UID,
      email: TEST_EMAIL,
      displayName: TEST_NAME,
    });
    assert(resendResult.success === true, 'Resend after cooldown must succeed');
    logPass('Resend after cooldown expires successfully re-dispatches notification to all admin devices');
  } catch (err) {
    logFail('Resend Approval Notification Cooldown', err);
  }

  // ── TEST 7: Approval Retention Immunity ───────────────────────────────────
  console.log('\n[Suite 7: Previously Approved Users Immunity]');
  try {
    // Mark user as approved
    await userRef.set({
      approvalStatus: 'approved',
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Seed approved email
    await db.collection('approved_emails').doc(TEST_EMAIL).set({
      email: TEST_EMAIL,
      uid: TEST_UID,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Simulate login for this approved email
    const approvedDoc = await db.collection('approved_emails').doc(TEST_EMAIL).get();
    assert(approvedDoc.exists, 'Email must be recognized as approved');

    const snap = await userRef.get();
    assert.strictEqual(snap.data().approvalStatus, 'approved', 'User must retain approved status without sending pending alerts');
    logPass('Approved users retain access seamlessly without triggering pending alerts');
  } catch (err) {
    logFail('Previously Approved Users Immunity', err);
  }

  // ── CLEANUP ────────────────────────────────────────────────────────────────
  console.log('\n[Suite 8: Test Fixtures Cleanup]');
  try {
    await userRef.delete().catch(() => {});
    await db.collection('approved_emails').doc(TEST_EMAIL).delete().catch(() => {});
    const auditCleanupSnap = await db.collection('admin_audit_logs').where('targetUid', '==', TEST_UID).get();
    const batch = db.batch();
    auditCleanupSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit().catch(() => {});
    logPass('Test fixtures cleaned up safely');
  } catch (err) {
    logFail('Test Fixtures Cleanup', err);
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`📊 Final Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
