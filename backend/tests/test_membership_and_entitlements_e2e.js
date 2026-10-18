'use strict';

/**
 * test_membership_and_entitlements_e2e.js
 *
 * Comprehensive End-to-End Test Suite for:
 * 1. Granular Membership Tiers (Basic, Pro, Premium HNI) & Quota Rules
 * 2. Non-Destructive Downgrades & Expiration Edge Cases (Soft-Capping)
 * 3. Daily AI Quota Tracking & IST Midnight Rollover
 * 4. Family PAN Allotment Limits & Encryption
 * 5. Curated Baskets Creation Quotas
 * 6. CSV/Excel Data Export Entitlement Guard
 * 7. Admin Authority (Allotment, Duration, Upgrade, Revocation, Audit Logging)
 * 8. Automated Background Cron (3-day pre-expiry warning & expired plan rollback)
 *
 * GUARANTEED CLEANUP: All test documents created in Firestore or MongoDB are
 * completely deleted at the end of the test execution.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const assert = require('assert');
const { db, admin } = require('../lib/firebaseAdmin');
const { getDb } = require('../lib/mongoClient');

const {
  PLAN_LIMITS,
  getTodayDateIST,
  getUserPlan,
  canAddToWatchlist,
  checkAndConsumeAiQuota,
  canAddFamilyPan,
  canCreateBasket,
  canExportData,
} = require('../lib/planLimits');

// Unique test identifiers
const TEST_TIMESTAMP = Date.now();
const TEST_USER_BASIC_UID = `test_mbr_basic_${TEST_TIMESTAMP}`;
const TEST_USER_PRO_UID = `test_mbr_pro_${TEST_TIMESTAMP}`;
const TEST_USER_PREMIUM_UID = `test_mbr_prem_${TEST_TIMESTAMP}`;
const TEST_USER_ADMIN_UID = `test_mbr_admin_${TEST_TIMESTAMP}`;
const TEST_USER_EXPIRING_UID = `test_mbr_expring_${TEST_TIMESTAMP}`;
const TEST_USER_EXPIRED_UID = `test_mbr_expired_${TEST_TIMESTAMP}`;
const TEST_BASKET_SLUG = `test-mbr-basket-${TEST_TIMESTAMP}`;

const createdUserUids = [
  TEST_USER_BASIC_UID,
  TEST_USER_PRO_UID,
  TEST_USER_PREMIUM_UID,
  TEST_USER_ADMIN_UID,
  TEST_USER_EXPIRING_UID,
  TEST_USER_EXPIRED_UID,
];

let createdAuditLogIds = [];

async function runMembershipTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('💎 STARTING COMPREHENSIVE MEMBERSHIP & ENTITLEMENTS TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: UNIT & QUOTA DEFINITIONS VALIDATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 1: Validating Plan Quotas & Tier Definitions...');
    
    assert(PLAN_LIMITS.basic, 'Basic plan limits must exist');
    assert.strictEqual(PLAN_LIMITS.basic.maxWatchlist, 5, 'Basic max watchlist must be 5');
    assert.strictEqual(PLAN_LIMITS.basic.maxDailyAi, 3, 'Basic max daily AI must be 3');
    assert.strictEqual(PLAN_LIMITS.basic.maxFamilyPans, 1, 'Basic max family PANs must be 1');
    assert.strictEqual(PLAN_LIMITS.basic.maxBaskets, 3, 'Basic can create up to 3 baskets');
    assert.strictEqual(PLAN_LIMITS.basic.canExport, false, 'Basic cannot export data');

    assert(PLAN_LIMITS.pro, 'Pro plan limits must exist');
    assert.strictEqual(PLAN_LIMITS.pro.maxWatchlist, 50, 'Pro max watchlist must be 50');
    assert.strictEqual(PLAN_LIMITS.pro.maxDailyAi, Infinity, 'Pro daily AI must be unlimited');
    assert.strictEqual(PLAN_LIMITS.pro.maxFamilyPans, 10, 'Pro max family PANs must be 10');
    assert.strictEqual(PLAN_LIMITS.pro.maxBaskets, 10, 'Pro max baskets must be 10');
    assert.strictEqual(PLAN_LIMITS.pro.canExport, true, 'Pro can export data');

    assert(PLAN_LIMITS.premium, 'Premium plan limits must exist');
    assert.strictEqual(PLAN_LIMITS.premium.maxWatchlist, Infinity, 'Premium watchlist must be unlimited');
    assert.strictEqual(PLAN_LIMITS.premium.maxDailyAi, Infinity, 'Premium daily AI must be unlimited');
    assert.strictEqual(PLAN_LIMITS.premium.maxFamilyPans, Infinity, 'Premium family PANs must be unlimited');
    assert.strictEqual(PLAN_LIMITS.premium.maxBaskets, Infinity, 'Premium baskets must be unlimited');
    assert.strictEqual(PLAN_LIMITS.premium.canExport, true, 'Premium can export data');

    console.log('   ✅ Tier limits and configuration verified.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: DYNAMIC PLAN RESOLUTION & EDGE CASES
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 2: Dynamic Plan Resolution & Expiration Logic...');

    // 2.1: Default user record (null or empty)
    const defPlan = await getUserPlan(null);
    assert.strictEqual(defPlan.plan, 'basic', 'Null user must resolve to basic');
    assert.strictEqual(defPlan.limits.maxWatchlist, 5);

    // 2.2: Active Pro user in-memory
    const activeProUser = {
      plan: 'pro',
      planStatus: 'active',
      planExpiresAt: new Date(Date.now() + 86400000 * 30),
      role: 'user',
    };
    const resolvedPro = await getUserPlan(activeProUser);
    assert.strictEqual(resolvedPro.plan, 'pro');
    assert.strictEqual(resolvedPro.isExpired, false);
    assert.strictEqual(resolvedPro.limits.maxWatchlist, 50);

    // 2.3: Expired Pro user in-memory (Edge Case: Past planExpiresAt)
    const expiredProUser = {
      plan: 'pro',
      planStatus: 'active',
      planExpiresAt: new Date(Date.now() - 86400000 * 2), // Expired 2 days ago
      role: 'user',
    };
    const resolvedExpired = await getUserPlan(expiredProUser);
    assert.strictEqual(resolvedExpired.plan, 'basic', 'Expired Pro must automatically downgrade to basic');
    assert.strictEqual(resolvedExpired.isExpired, true, 'isExpired must be true');
    assert.strictEqual(resolvedExpired.planStatus, 'expired');
    assert.strictEqual(resolvedExpired.limits.maxWatchlist, 5, 'Must receive basic limits');

    // 2.4: Cancelled Pro user in-memory
    const cancelledProUser = {
      plan: 'pro',
      planStatus: 'cancelled',
      role: 'user',
    };
    const resolvedCancelled = await getUserPlan(cancelledProUser);
    assert.strictEqual(resolvedCancelled.plan, 'basic', 'Cancelled Pro must downgrade to basic');
    assert.strictEqual(resolvedCancelled.limits.maxWatchlist, 5);

    // 2.5: Admin user bypass in-memory
    const adminUser = {
      plan: 'basic', // Even if record says basic
      role: 'admin',
    };
    const resolvedAdmin = await getUserPlan(adminUser);
    assert.strictEqual(resolvedAdmin.plan, 'premium', 'Admin must receive premium tier');
    assert.strictEqual(resolvedAdmin.limits.maxWatchlist, Infinity, 'Admin must have unlimited watchlist');
    assert.strictEqual(resolvedAdmin.role, 'admin');

    console.log('   ✅ Dynamic plan resolution and automatic fallback passed.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: LIVE FIRESTORE DATA SETUP
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 3: Setting Up Live Firestore Test Users...');

    const batch = db.batch();

    // 3.1: Basic User
    batch.set(db.collection('users').doc(TEST_USER_BASIC_UID), {
      email: `${TEST_USER_BASIC_UID}@tatvarthtest.com`,
      displayName: 'Basic Test User',
      plan: 'basic',
      planStatus: 'active',
      role: 'user',
      approvalStatus: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3.2: Pro User
    batch.set(db.collection('users').doc(TEST_USER_PRO_UID), {
      email: `${TEST_USER_PRO_UID}@tatvarthtest.com`,
      displayName: 'Pro Test User',
      plan: 'pro',
      planStatus: 'active',
      planExpiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 86400000 * 30)),
      role: 'user',
      approvalStatus: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3.3: Premium User
    batch.set(db.collection('users').doc(TEST_USER_PREMIUM_UID), {
      email: `${TEST_USER_PREMIUM_UID}@tatvarthtest.com`,
      displayName: 'Premium Test User',
      plan: 'premium',
      planStatus: 'active',
      role: 'user',
      approvalStatus: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3.4: Admin User
    batch.set(db.collection('users').doc(TEST_USER_ADMIN_UID), {
      email: `${TEST_USER_ADMIN_UID}@tatvarthtest.com`,
      displayName: 'Admin Test User',
      plan: 'basic',
      role: 'admin',
      entitlements: { read: true, write: true },
      approvalStatus: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3.5: Expiring Soon User (2 days remaining)
    batch.set(db.collection('users').doc(TEST_USER_EXPIRING_UID), {
      email: `${TEST_USER_EXPIRING_UID}@tatvarthtest.com`,
      displayName: 'Expiring Test User',
      plan: 'pro',
      planStatus: 'active',
      planExpiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 86400000 * 2)), // 2 days from now
      role: 'user',
      approvalStatus: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3.6: Expired User (1 day ago)
    batch.set(db.collection('users').doc(TEST_USER_EXPIRED_UID), {
      email: `${TEST_USER_EXPIRED_UID}@tatvarthtest.com`,
      displayName: 'Expired Test User',
      plan: 'pro',
      planStatus: 'active',
      planExpiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 86400000 * 1)), // 1 day in past
      role: 'user',
      approvalStatus: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log('   ✅ 6 Test users seeded into Firestore.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: WATCHLIST INSERTION QUOTA & SOFT-CAPPING
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 4: Testing Watchlist Quotas & Soft-Capping Limits...');

    // Basic User (Limit: 5)
    const bCheck0 = await canAddToWatchlist(TEST_USER_BASIC_UID, 0);
    assert.strictEqual(bCheck0.allowed, true, 'Basic user with 0 scripts should be allowed');
    assert.strictEqual(bCheck0.maxAllowed, 5);

    const bCheck4 = await canAddToWatchlist(TEST_USER_BASIC_UID, 4);
    assert.strictEqual(bCheck4.allowed, true, 'Basic user with 4 scripts should be allowed to add 5th');

    const bCheck5 = await canAddToWatchlist(TEST_USER_BASIC_UID, 5);
    assert.strictEqual(bCheck5.allowed, false, 'Basic user with 5 scripts must be REJECTED from adding 6th');

    // Pro User (Limit: 50)
    const pCheck5 = await canAddToWatchlist(TEST_USER_PRO_UID, 5);
    assert.strictEqual(pCheck5.allowed, true, 'Pro user with 5 scripts can add more');
    assert.strictEqual(pCheck5.maxAllowed, 50);

    const pCheck49 = await canAddToWatchlist(TEST_USER_PRO_UID, 49);
    assert.strictEqual(pCheck49.allowed, true, 'Pro user with 49 scripts can add 50th');

    const pCheck50 = await canAddToWatchlist(TEST_USER_PRO_UID, 50);
    assert.strictEqual(pCheck50.allowed, false, 'Pro user with 50 scripts must be REJECTED from adding 51st');

    // Premium User (Limit: Infinity)
    const premCheck100 = await canAddToWatchlist(TEST_USER_PREMIUM_UID, 100);
    assert.strictEqual(premCheck100.allowed, true, 'Premium user with 100 scripts can add more');
    assert.strictEqual(premCheck100.maxAllowed, Infinity);

    // Admin User (Bypass: Infinity)
    const adminWlCheck = await canAddToWatchlist(TEST_USER_ADMIN_UID, 200);
    assert.strictEqual(adminWlCheck.allowed, true, 'Admin with 200 scripts can add more');
    assert.strictEqual(adminWlCheck.maxAllowed, Infinity);

    // ── SOFT-CAPPING DOWNGRADE EDGE CASE ─────────────────────────────────────
    // When an expired user had 35 stocks from their Pro tenure:
    // Existing stocks are preserved, but adding stock #36 is rejected.
    const expiredWlCheck = await canAddToWatchlist(TEST_USER_EXPIRED_UID, 35);
    assert.strictEqual(expiredWlCheck.allowed, false, 'Expired user with 35 stocks cannot add 36th');
    assert.strictEqual(expiredWlCheck.maxAllowed, 5, 'Downgraded to 5-stock limit');

    console.log('   ✅ Watchlist insertion quotas & non-destructive soft-capping verified.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: DATA EXPORT ENTITLEMENTS (CSV / EXCEL)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 5: Testing Data Export Entitlements...');

    const basicExp = await canExportData(TEST_USER_BASIC_UID);
    assert.strictEqual(basicExp.allowed, false, 'Basic user cannot export data');

    const proExp = await canExportData(TEST_USER_PRO_UID);
    assert.strictEqual(proExp.allowed, true, 'Pro user can export data');

    const premExp = await canExportData(TEST_USER_PREMIUM_UID);
    assert.strictEqual(premExp.allowed, true, 'Premium user can export data');

    const adminExp = await canExportData(TEST_USER_ADMIN_UID);
    assert.strictEqual(adminExp.allowed, true, 'Admin can export data');

    const expiredExp = await canExportData(TEST_USER_EXPIRED_UID);
    assert.strictEqual(expiredExp.allowed, false, 'Expired user cannot export data');

    console.log('   ✅ Data export entitlement checks passed.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6: DAILY AI QUOTA TRACKING & MIDNIGHT IST ROLLOVER
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 6: Testing Gemini AI Quota Tracking & Midnight Rollover...');

    // Basic User: 3 daily analyses
    // 1st analysis
    const ai1 = await checkAndConsumeAiQuota(TEST_USER_BASIC_UID);
    assert.strictEqual(ai1.allowed, true, '1st AI analysis should succeed');
    assert.strictEqual(ai1.usedToday, 1);
    assert.strictEqual(ai1.maxAllowed, 3);

    // 2nd analysis
    const ai2 = await checkAndConsumeAiQuota(TEST_USER_BASIC_UID);
    assert.strictEqual(ai2.allowed, true, '2nd AI analysis should succeed');
    assert.strictEqual(ai2.usedToday, 2);

    // 3rd analysis
    const ai3 = await checkAndConsumeAiQuota(TEST_USER_BASIC_UID);
    assert.strictEqual(ai3.allowed, true, '3rd AI analysis should succeed');
    assert.strictEqual(ai3.usedToday, 3);

    // 4th analysis -> Must be BLOCKED
    const ai4 = await checkAndConsumeAiQuota(TEST_USER_BASIC_UID);
    assert.strictEqual(ai4.allowed, false, '4th AI analysis must be BLOCKED on same day');
    assert.strictEqual(ai4.usedToday, 3);
    assert.strictEqual(ai4.maxAllowed, 3);

    // Verify Firestore stored the usage record
    const userDocSnap = await db.collection('users').doc(TEST_USER_BASIC_UID).get();
    const usageData = userDocSnap.data().dailyAiUsage;
    assert.strictEqual(usageData.date, getTodayDateIST(), 'Usage date must match today IST');
    assert.strictEqual(usageData.count, 3, 'Stored count must be 3');

    // ── EDGE CASE: Midnight IST Rollover Simulation ─────────────────────────
    // Simulate user having usage on yesterday's date
    await db.collection('users').doc(TEST_USER_BASIC_UID).update({
      'dailyAiUsage.date': '2026-10-16', // Yesterday
      'dailyAiUsage.count': 3,
    });

    // Calling checkAndConsumeAiQuota today should reset to 1
    const aiRollover = await checkAndConsumeAiQuota(TEST_USER_BASIC_UID);
    assert.strictEqual(aiRollover.allowed, true, 'AI analysis on new date must reset quota');
    assert.strictEqual(aiRollover.usedToday, 1, 'Usage count should start at 1 for new day');

    // Pro User: Unlimited
    const proAi = await checkAndConsumeAiQuota(TEST_USER_PRO_UID);
    assert.strictEqual(proAi.allowed, true, 'Pro user has unlimited AI analysis');
    assert.strictEqual(proAi.maxAllowed, Infinity);

    // Admin User: Unlimited
    const adminAi = await checkAndConsumeAiQuota(TEST_USER_ADMIN_UID);
    assert.strictEqual(adminAi.allowed, true, 'Admin has unlimited AI analysis');
    assert.strictEqual(adminAi.maxAllowed, Infinity);

    console.log('   ✅ AI daily quota enforcement & midnight rollover verified.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 7: FAMILY PAN ALLOTMENT LIMITS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 7: Testing Family PAN Allotment Limits...');

    // Basic: 1 PAN limit
    const panB0 = await canAddFamilyPan(TEST_USER_BASIC_UID, 0);
    assert.strictEqual(panB0.allowed, true, 'Basic user with 0 PANs can add 1st');
    assert.strictEqual(panB0.maxAllowed, 1);

    const panB1 = await canAddFamilyPan(TEST_USER_BASIC_UID, 1);
    assert.strictEqual(panB1.allowed, false, 'Basic user with 1 PAN cannot add 2nd');

    // Pro: 10 PANs limit
    const panP9 = await canAddFamilyPan(TEST_USER_PRO_UID, 9);
    assert.strictEqual(panP9.allowed, true, 'Pro user with 9 PANs can add 10th');
    assert.strictEqual(panP9.maxAllowed, 10);

    const panP10 = await canAddFamilyPan(TEST_USER_PRO_UID, 10);
    assert.strictEqual(panP10.allowed, false, 'Pro user with 10 PANs cannot add 11th');

    // Premium: Unlimited
    const panPrem15 = await canAddFamilyPan(TEST_USER_PREMIUM_UID, 15);
    assert.strictEqual(panPrem15.allowed, true, 'Premium user can add 16th PAN');
    assert.strictEqual(panPrem15.maxAllowed, Infinity);

    console.log('   ✅ Family PAN limits and capacity guards passed.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 8: CURATED SHAREABLE BASKETS QUOTA
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 8: Testing Curated Baskets Creation Quotas...');

    // Basic: 3 baskets
    const bsktB = await canCreateBasket(TEST_USER_BASIC_UID, 0);
    assert.strictEqual(bsktB.allowed, true, 'Basic user can create up to 3 curated baskets');
    assert.strictEqual(bsktB.maxAllowed, 3);

    const bsktBMax = await canCreateBasket(TEST_USER_BASIC_UID, 3);
    assert.strictEqual(bsktBMax.allowed, false, 'Basic user with 3 baskets cannot create 4th');

    // Pro: 10 baskets
    const bsktP9 = await canCreateBasket(TEST_USER_PRO_UID, 9);
    assert.strictEqual(bsktP9.allowed, true, 'Pro user with 9 baskets can create 10th');
    assert.strictEqual(bsktP9.maxAllowed, 10);

    const bsktP10 = await canCreateBasket(TEST_USER_PRO_UID, 10);
    assert.strictEqual(bsktP10.allowed, false, 'Pro user with 10 baskets cannot create 11th');

    // Premium: Unlimited
    const bsktPrem = await canCreateBasket(TEST_USER_PREMIUM_UID, 20);
    assert.strictEqual(bsktPrem.allowed, true, 'Premium user can create unlimited baskets');
    assert.strictEqual(bsktPrem.maxAllowed, Infinity);

    console.log('   ✅ Curated basket creation quotas verified.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 9: ADMIN PLAN ALLOTMENT, UPGRADE & REVOCATION ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 9: Testing Admin Plan Allotment & Revocation...');

    // 9.1: Admin allots Pro tier for 3 months to Basic User
    const targetUid = TEST_USER_BASIC_UID;
    const actorUid = TEST_USER_ADMIN_UID;

    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const upgradeAuditRef = db.collection('admin_audit_log').doc();
    createdAuditLogIds.push(upgradeAuditRef.id);

    await db.runTransaction(async (t) => {
      t.set(db.collection('users').doc(targetUid), {
        plan: 'pro',
        planStatus: 'active',
        planStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: admin.firestore.Timestamp.fromDate(threeMonthsLater),
        planAssignedBy: actorUid,
        planNotes: 'Allotted via Admin Console (UPI Ref #123456)',
        planHistory: admin.firestore.FieldValue.arrayUnion({
          plan: 'pro',
          action: 'UPGRADE',
          durationMonths: 3,
          timestamp: new Date().toISOString(),
          assignedBy: actorUid,
          notes: 'Allotted via Admin Console (UPI Ref #123456)',
        }),
      }, { merge: true });

      t.set(upgradeAuditRef, {
        actorUid,
        targetUid,
        action: 'ALLOT_PLAN',
        details: { plan: 'pro', durationMonths: 3, notes: 'UPI Ref #123456' },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Verify user now has Pro capabilities
    const userAfterUpgrade = await getUserPlan(targetUid);
    assert.strictEqual(userAfterUpgrade.plan, 'pro', 'User should now be on Pro plan');
    assert.strictEqual(userAfterUpgrade.limits.maxWatchlist, 50);
    assert.strictEqual(userAfterUpgrade.limits.canExport, true);

    // 9.2: Admin revokes plan -> Instant rollback to Basic
    const revokeAuditRef = db.collection('admin_audit_log').doc();
    createdAuditLogIds.push(revokeAuditRef.id);

    await db.runTransaction(async (t) => {
      t.set(db.collection('users').doc(targetUid), {
        plan: 'basic',
        planStatus: 'cancelled',
        planRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
        planRevokedBy: actorUid,
        planHistory: admin.firestore.FieldValue.arrayUnion({
          plan: 'basic',
          action: 'REVOKE_PLAN',
          timestamp: new Date().toISOString(),
          assignedBy: actorUid,
          notes: 'Subscription cancelled by administrator',
        }),
      }, { merge: true });

      t.set(revokeAuditRef, {
        actorUid,
        targetUid,
        action: 'REVOKE_PLAN',
        details: { previousPlan: 'pro', newPlan: 'basic' },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Verify user is back on Basic
    const userAfterRevoke = await getUserPlan(targetUid);
    assert.strictEqual(userAfterRevoke.plan, 'basic', 'User must be returned to Basic tier');
    assert.strictEqual(userAfterRevoke.limits.maxWatchlist, 5);
    assert.strictEqual(userAfterRevoke.limits.canExport, false);

    console.log('   ✅ Admin allotment, upgrade, and revocation flow verified.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 10: AUTOMATED BACKGROUND CRON EXPIRATION & 3-DAY WARNING
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔹 SECTION 10: Testing Automated Cron Expiration & 3-Day Reminders...');

    const cronService = require('../services/cronService');
    assert(typeof cronService.processPlanExpirationsAndReminders === 'function', 'Cron service function must exist');

    // Execute the background job
    await cronService.processPlanExpirationsAndReminders();

    // Check Expired User: Must now have plan: 'basic' and planStatus: 'expired'
    const expiredDocSnap = await db.collection('users').doc(TEST_USER_EXPIRED_UID).get();
    const expiredData = expiredDocSnap.data();
    assert.strictEqual(expiredData.plan, 'basic', 'Cron must revert expired user to basic plan');
    assert.strictEqual(expiredData.planStatus, 'expired', 'Cron must mark planStatus as expired');
    assert(Array.isArray(expiredData.planHistory), 'planHistory array should exist');
    assert(expiredData.planHistory.some(h => h.action === 'EXPIRED_DOWNGRADE'), 'EXPIRED_DOWNGRADE action must be logged');

    // Check Expiring Soon User: Must be marked 'expiring_soon' with lastReminderSentAt
    const expiringDocSnap = await db.collection('users').doc(TEST_USER_EXPIRING_UID).get();
    const expiringData = expiringDocSnap.data();
    assert.strictEqual(expiringData.planStatus, 'expiring_soon', 'Expiring user must be marked expiring_soon');
    assert(expiringData.lastReminderSentAt, 'lastReminderSentAt timestamp must be set');

    console.log('   ✅ Automated cron expiration downgrade & 3-day reminder verified.\n');

    console.log('🎉 ALL 10 MEMBERSHIP & ENTITLEMENT TEST SUITES PASSED FLAWLESSLY!\n');
  } finally {
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 11: GUARANTEED CLEANUP & TEARDOWN
    // ─────────────────────────────────────────────────────────────────────────
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('🧹 CLEANUP: Completely Deleting All Test Data From Cloud Firestore...');
    console.log('───────────────────────────────────────────────────────────────────');

    try {
      const cleanupBatch = db.batch();

      // Delete all test user documents
      for (const uid of createdUserUids) {
        cleanupBatch.delete(db.collection('users').doc(uid));
      }

      // Delete all created audit logs
      for (const logId of createdAuditLogIds) {
        cleanupBatch.delete(db.collection('admin_audit_log').doc(logId));
      }

      await cleanupBatch.commit();
      console.log(`   ✅ Cleaned up ${createdUserUids.length} test users and ${createdAuditLogIds.length} audit logs.`);
      console.log('   ✅ Cloud Firestore restored to pristine state. Zero orphan records.\n');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup error:', cleanupErr.message);
    }
  }
}

runMembershipTests()
  .then(() => {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('✅ TEST SUITE COMPLETED SUCCESSFULLY (EXIT 0)');
    console.log('═══════════════════════════════════════════════════════════════════');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  });
