'use strict';

/**
 * planLimits.js
 *
 * Central source of truth for Membership Tiers & Quota Limits.
 * Tiers:
 *   - 'basic'   (Free / Starter): 5 watchlist scrips, 3 AI analyses/day, 1 family PAN
 *   - 'pro'     (Active Trader - ₹999/mo): 50 watchlist scrips, unlimited AI, 10 family PANs, exports, 5 baskets
 *   - 'premium' (HNI / Family Office - ₹1999/mo): Unlimited watchlist, unlimited AI, unlimited PANs, custom radar, unlimited baskets
 */

const { db, admin } = require('./firebaseAdmin');

const PLAN_LIMITS = {
  basic: {
    name: 'Basic',
    priceMonthly: 0,
    priceAnnual: 0,
    maxWatchlist: 5,
    maxDailyAi: 3,
    maxFamilyPans: 1,
    maxBaskets: 0,
    canExport: false,
    canUseRadar: false,
    priorityPush: false,
  },
  pro: {
    name: 'Pro',
    priceMonthly: 999,
    priceAnnual: 8999,
    maxWatchlist: 50,
    maxDailyAi: Infinity,
    maxFamilyPans: 10,
    maxBaskets: 5,
    canExport: true,
    canUseRadar: false,
    priorityPush: true,
  },
  premium: {
    name: 'Premium HNI',
    priceMonthly: 1999,
    priceAnnual: 17999,
    maxWatchlist: Infinity,
    maxDailyAi: Infinity,
    maxFamilyPans: Infinity,
    maxBaskets: Infinity,
    canExport: true,
    canUseRadar: true,
    priorityPush: true,
  },
};

/**
 * Get current active date string in IST ('YYYY-MM-DD').
 */
function getTodayDateIST() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  return istDate.toISOString().split('T')[0];
}

/**
 * Fetch and resolve user's active plan profile.
 * Automatically handles expiration if planExpiresAt has passed.
 *
 * @param {string|object} userOrUid - User UID or pre-fetched user object
 * @returns {Promise<{ plan: string, planStatus: string, limits: object, expiresAt: Date|null, isExpired: boolean, role: string }>}
 */
async function getUserPlan(userOrUid) {
  if (!userOrUid) {
    return {
      plan: 'basic',
      planStatus: 'active',
      limits: PLAN_LIMITS.basic,
      expiresAt: null,
      isExpired: false,
      role: 'user',
    };
  }

  let data;
  if (typeof userOrUid === 'object' && userOrUid !== null && (userOrUid.plan !== undefined || userOrUid.role !== undefined)) {
    data = userOrUid;
  } else {
    const uid = typeof userOrUid === 'string' ? userOrUid : userOrUid?.uid;
    if (!uid) {
      return {
        plan: 'basic',
        planStatus: 'active',
        limits: PLAN_LIMITS.basic,
        expiresAt: null,
        isExpired: false,
        role: 'user',
      };
    }
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) {
        return {
          plan: 'basic',
          planStatus: 'active',
          limits: PLAN_LIMITS.basic,
          expiresAt: null,
          isExpired: false,
          role: 'user',
        };
      }
      data = snap.data() || {};
    } catch (err) {
      console.error(`[PlanLimits] Error getting user plan for ${uid}:`, err.message);
      return {
        plan: 'basic',
        planStatus: 'active',
        limits: PLAN_LIMITS.basic,
        expiresAt: null,
        isExpired: false,
        role: 'user',
      };
    }
  }
    const role = data.role || 'user';

    // Admins always have Premium / Unlimited capabilities
    if (role === 'admin') {
      return {
        plan: 'premium',
        planStatus: 'active',
        limits: PLAN_LIMITS.premium,
        expiresAt: null,
        isExpired: false,
        role: 'admin',
      };
    }

    let plan = (data.plan || 'basic').toLowerCase();
    if (!PLAN_LIMITS[plan]) plan = 'basic';

    let expiresAt = null;
    let isExpired = false;

    if (data.planExpiresAt) {
      expiresAt = data.planExpiresAt.toDate ? data.planExpiresAt.toDate() : new Date(data.planExpiresAt);
      if (expiresAt && expiresAt.getTime() < Date.now()) {
        isExpired = true;
      }
    }

    const isCancelledOrRevoked = ['cancelled', 'revoked', 'expired'].includes(data.planStatus);

    // If a paid plan has expired or was cancelled/revoked, fallback gracefully to basic
    if (plan !== 'basic' && (isExpired || isCancelledOrRevoked)) {
      return {
        plan: 'basic',
        planStatus: isExpired ? 'expired' : (data.planStatus || 'active'),
        limits: PLAN_LIMITS.basic,
        expiresAt,
        isExpired: isExpired || data.planStatus === 'expired',
        role,
      };
    }

    return {
      plan,
      planStatus: data.planStatus || 'active',
      limits: PLAN_LIMITS[plan],
      expiresAt,
      isExpired: false,
      role,
    };
}

/**
 * Check if user can add a script to their watchlist.
 */
async function canAddToWatchlist(uid, currentCount = 0) {
  const { plan, limits, role } = await getUserPlan(uid);
  if (role === 'admin') return { allowed: true, plan, maxAllowed: Infinity, currentCount };

  const allowed = currentCount < limits.maxWatchlist;
  return {
    allowed,
    plan,
    maxAllowed: limits.maxWatchlist,
    currentCount,
  };
}

/**
 * Check and consume 1 AI analysis quota for the user.
 * Basic users get 3 / day (resets midnight IST). Pro & Premium get unlimited.
 */
async function checkAndConsumeAiQuota(uid) {
  const { plan, limits, role } = await getUserPlan(uid);
  if (role === 'admin' || limits.maxDailyAi === Infinity) {
    return { allowed: true, plan, usedToday: 0, maxAllowed: Infinity };
  }

  const todayStr = getTodayDateIST();
  const userRef = db.collection('users').doc(uid);

  try {
    const docSnap = await userRef.get();
    const data = docSnap.exists ? docSnap.data() : {};
    const usage = data.dailyAiUsage || {};

    let currentUsed = 0;
    if (usage.date === todayStr) {
      currentUsed = Number(usage.count || 0);
    }

    if (currentUsed >= limits.maxDailyAi) {
      return {
        allowed: false,
        plan,
        usedToday: currentUsed,
        maxAllowed: limits.maxDailyAi,
        resetsAt: 'Midnight IST',
      };
    }

    // Increment usage for today
    await userRef.set({
      dailyAiUsage: {
        date: todayStr,
        count: currentUsed + 1,
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true });

    return {
      allowed: true,
      plan,
      usedToday: currentUsed + 1,
      maxAllowed: limits.maxDailyAi,
    };
  } catch (err) {
    console.error(`[PlanLimits] Error checking AI quota for ${uid}:`, err.message);
    // On Firestore error, allow gracefully
    return { allowed: true, plan, usedToday: 0, maxAllowed: limits.maxDailyAi };
  }
}

/**
 * Check if user can add a family PAN.
 */
async function canAddFamilyPan(uid, currentCount = 0) {
  const { plan, limits, role } = await getUserPlan(uid);
  if (role === 'admin') return { allowed: true, plan, maxAllowed: Infinity, currentCount };

  const allowed = currentCount < limits.maxFamilyPans;
  return {
    allowed,
    plan,
    maxAllowed: limits.maxFamilyPans,
    currentCount,
  };
}

/**
 * Check if user can create a shareable watchlist basket.
 */
async function canCreateBasket(uid, currentCount = 0) {
  const { plan, limits, role } = await getUserPlan(uid);
  if (role === 'admin') return { allowed: true, plan, maxAllowed: Infinity, currentCount };

  const allowed = currentCount < limits.maxBaskets;
  return {
    allowed,
    plan,
    maxAllowed: limits.maxBaskets,
    currentCount,
  };
}

/**
 * Check if user has data export entitlements (.xlsx / .csv).
 */
async function canExportData(uid) {
  const { plan, limits, role } = await getUserPlan(uid);
  if (role === 'admin') return { allowed: true, plan };
  return {
    allowed: limits.canExport,
    plan,
  };
}

module.exports = {
  PLAN_LIMITS,
  getTodayDateIST,
  getUserPlan,
  canAddToWatchlist,
  checkAndConsumeAiQuota,
  canAddFamilyPan,
  canCreateBasket,
  canExportData,
};
