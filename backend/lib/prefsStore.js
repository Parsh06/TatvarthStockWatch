'use strict';

/**
 * prefsStore.js
 *
 * User preferences — stored in Firestore under users/{uid}.prefs
 *
 * Notification Scope Fields:
 *   notifyWatchlist         (boolean, default true)  — notify for watchlisted scripts
 *   notifyAllAnnouncements  (boolean, default false) — notify for ALL BSE/NSE announcements
 *
 * The canonical `notificationScope` enum is computed at runtime by
 * notificationScope.js → resolveNotificationScope(prefs).
 * It is also persisted here for fast reads and debugging.
 *
 * Normalization for legacy accounts (missing fields):
 *   missing notifyWatchlist        → true
 *   missing notifyAllAnnouncements → false
 */

const DEFAULT_PREFS = {
  // Notification channels
  telegramEnabled:        true,
  inAppEnabled:           true,
  frequency:              'realtime',

  // Announcement notification scope (new fields)
  notifyWatchlist:        true,
  notifyAllAnnouncements: false,

  // Derived canonical scope (stored for debugging/fast reads)
  notificationScope:      'WATCHLIST_ONLY',

  // Category blocking
  blockedCategories:      [],
};

/**
 * Compute the canonical notificationScope string from the two boolean fields.
 * Must mirror the logic in notificationScope.js → resolveNotificationScope().
 *
 * @param {Object} prefs
 * @returns {'ALL_ANNOUNCEMENTS'|'WATCHLIST_ONLY'|'NONE'}
 */
function computeScope(prefs) {
  if (prefs.notifyAllAnnouncements === true) return 'ALL_ANNOUNCEMENTS';
  if (prefs.notifyWatchlist !== false)       return 'WATCHLIST_ONLY';
  return 'NONE';
}

async function getPrefs(uid) {
  if (!uid) return { ...DEFAULT_PREFS };
  try {
    const { db } = require('./firebaseAdmin');
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return { ...DEFAULT_PREFS };
    const stored = snap.data().prefs || {};
    // Merge defaults to handle legacy accounts missing new fields
    return { ...DEFAULT_PREFS, ...stored };
  } catch (err) {
    console.error(`[prefsStore] Failed to get preferences for ${uid}:`, err.message);
    throw err;
  }
}

async function savePrefs(uid, prefs) {
  if (!uid) return { ...DEFAULT_PREFS };

  // Strict boolean validation for scope fields
  const notifyWatchlist        = prefs.notifyWatchlist        === true  ? true  : prefs.notifyWatchlist        === false ? false : DEFAULT_PREFS.notifyWatchlist;
  const notifyAllAnnouncements = prefs.notifyAllAnnouncements === true  ? true  : prefs.notifyAllAnnouncements === false ? false : DEFAULT_PREFS.notifyAllAnnouncements;

  const merged = {
    ...DEFAULT_PREFS,
    ...prefs,
    notifyWatchlist,
    notifyAllAnnouncements,
  };

  // Always persist the computed canonical scope
  merged.notificationScope = computeScope(merged);

  const { db } = require('./firebaseAdmin');
  await db.collection('users').doc(uid).set({ prefs: merged }, { merge: true });
  return merged;
}

module.exports = { getPrefs, savePrefs, DEFAULT_PREFS };
