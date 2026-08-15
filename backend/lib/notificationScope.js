'use strict';

/**
 * notificationScope.js
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SINGLE SOURCE OF TRUTH — Notification scope resolution                ║
 * ║  Converts user preference booleans into a canonical scope enum.        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Canonical Scopes:
 *   ALL_ANNOUNCEMENTS  — Every new BSE/NSE announcement qualifies (subject to category filters)
 *   WATCHLIST_ONLY     — Only announcements matching the user's watchlist qualify (default)
 *   NONE               — User has disabled announcement notifications
 *
 * Normalization Rules:
 *   notifyAllAnnouncements = true             → ALL_ANNOUNCEMENTS
 *   notifyAllAnnouncements = false
 *     AND notifyWatchlist = true              → WATCHLIST_ONLY
 *   notifyAllAnnouncements = false
 *     AND notifyWatchlist = false             → NONE
 *   notifyAllAnnouncements = true
 *     AND notifyWatchlist = true              → ALL_ANNOUNCEMENTS
 *       (ALL already includes watchlisted items — no separate pipeline)
 */

const SCOPE = {
  ALL_ANNOUNCEMENTS: 'ALL_ANNOUNCEMENTS',
  WATCHLIST_ONLY:    'WATCHLIST_ONLY',
  NONE:              'NONE',
};

/**
 * Resolve a canonical notification scope from user preferences.
 *
 * @param {Object} prefs — User preferences object from prefsStore.getPrefs()
 * @returns {'ALL_ANNOUNCEMENTS'|'WATCHLIST_ONLY'|'NONE'}
 */
function resolveNotificationScope(prefs) {
  // Strict boolean check per spec — never coerce strings
  if (prefs?.notifyAllAnnouncements === true) {
    return SCOPE.ALL_ANNOUNCEMENTS;
  }

  // Default: if notifyWatchlist is missing (legacy accounts), treat as true
  const watchlistEnabled = prefs?.notifyWatchlist !== false;
  if (watchlistEnabled) {
    return SCOPE.WATCHLIST_ONLY;
  }

  return SCOPE.NONE;
}

/**
 * Determine whether an announcement is in scope for a given user.
 *
 * @param {Object} params
 * @param {Object} params.announcement — Normalized announcement object
 * @param {string} params.scope — SCOPE constant from resolveNotificationScope()
 * @param {Set}    params.bseSet — Set of BSE script codes in user's watchlist
 * @param {Set}    params.nseSet — Set of NSE symbols in user's watchlist (uppercased)
 * @returns {{ inScope: boolean, reason: string }}
 */
function matchesNotificationScope({ announcement, scope, bseSet, nseSet }) {
  if (scope === SCOPE.NONE) {
    return { inScope: false, reason: 'BLOCKED_SCOPE_NONE' };
  }

  if (scope === SCOPE.ALL_ANNOUNCEMENTS) {
    return { inScope: true, reason: 'ALLOWED_ALL_SCOPE' };
  }

  // WATCHLIST_ONLY — check BSE and NSE sets
  if (scope === SCOPE.WATCHLIST_ONLY) {
    const code = (announcement.scriptCode || '').trim();
    const codeUpper = code.toUpperCase();

    if (bseSet && bseSet.has(code)) {
      return { inScope: true, reason: 'ALLOWED_WATCHLIST_BSE' };
    }
    if (nseSet && nseSet.has(codeUpper)) {
      return { inScope: true, reason: 'ALLOWED_WATCHLIST_NSE' };
    }
    return { inScope: false, reason: 'NO_WATCHLIST_MATCH' };
  }

  return { inScope: false, reason: 'UNKNOWN_SCOPE' };
}

module.exports = { SCOPE, resolveNotificationScope, matchesNotificationScope };
