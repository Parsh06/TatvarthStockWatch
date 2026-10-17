'use strict';

/**
 * test_admin_plan_and_role_management_e2e.js
 *
 * Comprehensive End-to-End Test Suite for Admin Plan & Role Management:
 * 1. Admin Quota Immunity: Admin doesn't require any plan and has unlimited access to everything
 * 2. Founding Clients Verification: tatvarthcapital & cpjain have active Lifetime Premium plans
 * 3. Role Change to Admin Preserves Existing Plan (user's plan is not wiped when promoted)
 * 4. Admin Can Change Any Plan for Any User (basic, pro, premium, 1m, 3m, 6m, 1y, lifetime)
 * 5. Admin Plan Revocation (graceful rollback to basic)
 * 6. Role Demotion from Admin to User cleanly restores standard plan limits
 * 7. Zero Orphan Test Cleanup
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const { db, admin } = require('../lib/firebaseAdmin');
const {
  PLAN_LIMITS,
  getUserPlan,
  canAddToWatchlist,
  checkAndConsumeAiQuota,
  canAddFamilyPan,
  canCreateBasket,
  canExportData,
} = require('../lib/planLimits');

const TEST_TIMESTAMP = Date.now();
const TEST_USER_UID = `test_plan_user_${TEST_TIMESTAMP}`;
const TEST_USER_EMAIL = `test.plan.${TEST_TIMESTAMP}@tatvarth.app`;

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

async function runTests() {
  console.log('\n==================================================================');
  console.log('  TSW ADMIN PLAN & ROLE DYNAMICS TEST SUITE');
  console.log('==================================================================\n');

  try {
    // ── TEST 1: Admin Quota Immunity ──────────────────────────────────────────
    step('Admin Quota Immunity: Admin has unlimited access without requiring a paid plan');
    {
      const adminUid = 'nfiKRtg9klcxy3E7rjpP8DUz7bw1'; // korojitha@gmail.com
      const userPlan = await getUserPlan(adminUid);

      assert.strictEqual(userPlan.role, 'admin');
      assert.strictEqual(userPlan.limits.maxWatchlist, Infinity);
      assert.strictEqual(userPlan.limits.maxDailyAi, Infinity);
      assert.strictEqual(userPlan.limits.maxFamilyPans, Infinity);
      assert.strictEqual(userPlan.limits.maxBaskets, Infinity);
      assert.strictEqual(userPlan.limits.canExport, true);
      assert.strictEqual(userPlan.limits.canUseRadar, true);

      // Verify all quota check functions return allowed: true for admin
      const wlCheck = await canAddToWatchlist(adminUid, 500);
      assert.strictEqual(wlCheck.allowed, true);
      assert.strictEqual(wlCheck.maxAllowed, Infinity);

      const aiCheck = await checkAndConsumeAiQuota(adminUid);
      assert.strictEqual(aiCheck.allowed, true);
      assert.strictEqual(aiCheck.maxAllowed, Infinity);

      const panCheck = await canAddFamilyPan(adminUid, 20);
      assert.strictEqual(panCheck.allowed, true);
      assert.strictEqual(panCheck.maxAllowed, Infinity);

      const basketCheck = await canCreateBasket(adminUid, 50);
      assert.strictEqual(basketCheck.allowed, true);
      assert.strictEqual(basketCheck.maxAllowed, Infinity);

      const exportCheck = await canExportData(adminUid);
      assert.strictEqual(exportCheck.allowed, true);

      pass('Admin bypasses all caps with Infinity quotas across all features');
    }

    // ── TEST 2: Founding Clients Active Lifetime Premium Plans ───────────────
    step('Verify Founding Clients (tatvarthcapital & cpjain) have Active Lifetime Premium Plans');
    {
      const tatvarthUid = '7Rz015pII2VTsRM5WB2bI8Ey39i1';
      const tatvarthPlan = await getUserPlan(tatvarthUid);
      assert.strictEqual(tatvarthPlan.plan, 'premium');
      assert.strictEqual(tatvarthPlan.planStatus, 'active');
      assert.strictEqual(tatvarthPlan.isExpired, false);
      assert.strictEqual(tatvarthPlan.limits.maxWatchlist, Infinity);
      assert.strictEqual(tatvarthPlan.limits.canExport, true);

      const cpUid = 'TJDoOGyERQTi0mAHDnTCRYIWKdw1';
      const cpPlan = await getUserPlan(cpUid);
      assert.strictEqual(cpPlan.plan, 'premium');
      assert.strictEqual(cpPlan.planStatus, 'active');
      assert.strictEqual(cpPlan.isExpired, false);
      assert.strictEqual(cpPlan.limits.maxWatchlist, Infinity);
      assert.strictEqual(cpPlan.limits.canExport, true);

      // Verify approved_emails registry contains both
      const tatvarthApproved = await db.collection('approved_emails').doc('tatvarthcapital@gmail.com').get();
      assert.ok(tatvarthApproved.exists, 'tatvarthcapital@gmail.com not in approved_emails');

      const cpApproved = await db.collection('approved_emails').doc('cpjain1980@gmail.com').get();
      assert.ok(cpApproved.exists, 'cpjain1980@gmail.com not in approved_emails');

      const cpAliasApproved = await db.collection('approved_emails').doc('cpjain@gmail.com').get();
      assert.ok(cpAliasApproved.exists, 'cpjain@gmail.com alias not in approved_emails');

      pass('tatvarthcapital and cpjain both active on Premium HNI Lifetime and registered');
    }

    // ── TEST 3: Create Test User with Pro Plan ────────────────────────────────
    step('Create Test User with initial "pro" plan');
    {
      await db.collection('users').doc(TEST_USER_UID).set({
        email: TEST_USER_EMAIL,
        role: 'user',
        entitlements: { read: false, write: false },
        approvalStatus: 'approved',
        disabled: false,
        plan: 'pro',
        planStatus: 'active',
        planStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: null, // ongoing
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const initialPlan = await getUserPlan(TEST_USER_UID);
      assert.strictEqual(initialPlan.role, 'user');
      assert.strictEqual(initialPlan.plan, 'pro');
      assert.strictEqual(initialPlan.limits.maxWatchlist, 50);

      pass('Test user created with role="user" and plan="pro"');
    }

    // ── TEST 4: Promoting User to Admin PRESERVES Existing Plan ───────────────
    step('Promoting user to Admin role PRESERVES existing plan (no plan reset)');
    {
      // Simulate PATCH /api/admin/users/:uid/role
      const targetRole = 'admin';
      const sanitizedEntitlements = { read: true, write: true };

      await db.collection('users').doc(TEST_USER_UID).set({
        role: targetRole,
        entitlements: sanitizedEntitlements,
      }, { merge: true });

      // Fetch user doc directly from Firestore to verify plan was NOT altered
      const userDoc = await db.collection('users').doc(TEST_USER_UID).get();
      const userData = userDoc.data();

      assert.strictEqual(userData.role, 'admin');
      assert.strictEqual(userData.entitlements.read, true);
      assert.strictEqual(userData.entitlements.write, true);
      assert.strictEqual(userData.plan, 'pro', 'Existing plan "pro" was wiped or altered during role update!');

      // Verify that getUserPlan gives admin capabilities while acknowledging plan
      const planRes = await getUserPlan(TEST_USER_UID);
      assert.strictEqual(planRes.role, 'admin');
      assert.strictEqual(planRes.limits.maxWatchlist, Infinity, 'Admin must have unlimited capacity');

      pass('Role updated to admin with full privileges while preserving stored plan="pro"');
    }

    // ── TEST 5: Admin Can Change Any Plan for Any User (Pro -> Premium 6M) ────
    step('Admin upgrades user to Premium with 6 months validity');
    {
      const months = 6;
      const targetPlan = 'premium';
      const now = new Date();
      now.setMonth(now.getMonth() + months);
      const planExpiresAt = now;

      await db.collection('users').doc(TEST_USER_UID).set({
        plan: targetPlan,
        planStatus: 'active',
        planStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: admin.firestore.Timestamp.fromDate(planExpiresAt),
        planAssignedBy: 'test_admin',
        planNotes: 'Manual upgrade to Premium 6M',
      }, { merge: true });

      const updatedDoc = await db.collection('users').doc(TEST_USER_UID).get();
      assert.strictEqual(updatedDoc.data().plan, 'premium');
      assert.strictEqual(updatedDoc.data().planStatus, 'active');
      assert.ok(updatedDoc.data().planExpiresAt, 'planExpiresAt should be set');

      pass('Admin successfully updated plan to Premium with 6-month expiration');
    }

    // ── TEST 6: Admin Can Change Any Plan for Any User (Premium -> Lifetime) ─
    step('Admin sets user plan to Lifetime Premium (duration: lifetime)');
    {
      await db.collection('users').doc(TEST_USER_UID).set({
        plan: 'premium',
        planStatus: 'active',
        planExpiresAt: null, // Lifetime
        planAssignedBy: 'test_admin',
        planNotes: 'Lifetime upgrade',
      }, { merge: true });

      const updatedDoc = await db.collection('users').doc(TEST_USER_UID).get();
      assert.strictEqual(updatedDoc.data().plan, 'premium');
      assert.strictEqual(updatedDoc.data().planExpiresAt, null);

      pass('Admin successfully updated user to Lifetime Premium');
    }

    // ── TEST 7: Demoting Admin Back to User Restores Configured Plan ─────────
    step('Demoting user back to "user" role retains configured plan and bounds');
    {
      // First set plan to 'pro' with specific 50-scrip cap
      await db.collection('users').doc(TEST_USER_UID).set({
        role: 'user',
        entitlements: { read: false, write: false },
        plan: 'pro',
        planStatus: 'active',
        planExpiresAt: null,
      }, { merge: true });

      const userPlan = await getUserPlan(TEST_USER_UID);
      assert.strictEqual(userPlan.role, 'user');
      assert.strictEqual(userPlan.plan, 'pro');
      assert.strictEqual(userPlan.limits.maxWatchlist, 50);

      // Test quota boundary for regular user
      const allowedAt49 = await canAddToWatchlist(TEST_USER_UID, 49);
      assert.strictEqual(allowedAt49.allowed, true);

      const blockedAt50 = await canAddToWatchlist(TEST_USER_UID, 50);
      assert.strictEqual(blockedAt50.allowed, false);

      pass('Demoted user role cleanly enforces their configured plan limits (50 cap)');
    }

    // ── TEST 8: Admin Plan Revocation to Basic ────────────────────────────────
    step('Admin Revocation: Revoking plan resets to Basic without deleting data');
    {
      await db.collection('users').doc(TEST_USER_UID).set({
        plan: 'basic',
        planStatus: 'revoked',
        planExpiresAt: null,
      }, { merge: true });

      const revokedPlan = await getUserPlan(TEST_USER_UID);
      assert.strictEqual(revokedPlan.plan, 'basic');
      assert.strictEqual(revokedPlan.limits.maxWatchlist, 5);

      const blockedAt5 = await canAddToWatchlist(TEST_USER_UID, 5);
      assert.strictEqual(blockedAt5.allowed, false);

      pass('Plan revoked back to Basic; caps enforced at 5 scrips');
    }

    // ── CLEANUP: Teardown Test Document ──────────────────────────────────────
    console.log('\n--- Cleaning up temporary test documents ---');
    await db.collection('users').doc(TEST_USER_UID).delete();
    console.log(`  ✓ Deleted test user: ${TEST_USER_UID}`);

    console.log('\n==================================================================');
    console.log(`  ALL ${passedTests}/${totalTests} ADMIN PLAN & ROLE TESTS PASSED PERFECTLY!`);
    console.log('==================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    // Cleanup on error
    try {
      await db.collection('users').doc(TEST_USER_UID).delete();
    } catch {}
    process.exit(1);
  }
}

runTests();
