'use strict';

/**
 * notificationFilter.js
 *
 * Single source of truth for ALL notification eligibility decisions.
 *
 * RULES:
 *  Notification is BLOCKED if ANY of the following are true:
 *    1. The parent group of `category` is in blockedCategories
 *    2. The parent group of `subCategory` is in blockedCategories
 *    3. The raw `category` string itself is in blockedCategories
 *    4. The raw `subCategory` string itself is in blockedCategories
 *
 *  In other words: if the user blocked it at ANY level, it is blocked.
 *  There is NO "at least one enabled" logic. Every matched dimension must be clear.
 */

const { resolveCategoryGroup } = require('./alertCategories');

/**
 * BLOCK_REASONS — used in the returned decision object.
 */
const BLOCK_REASONS = {
  BLOCKED_PARENT:      'BLOCKED_PARENT',      // parent group is in blockedCategories
  BLOCKED_SUBCATEGORY: 'BLOCKED_SUBCATEGORY', // raw subCategory is in blockedCategories
  BLOCKED_CATEGORY:    'BLOCKED_CATEGORY',    // raw category is in blockedCategories
  NOTIFICATIONS_OFF:   'NOTIFICATIONS_OFF',   // user disabled all notifications
  ALLOWED:             'ALLOWED',             // no block matched — send notification
};

/**
 * shouldNotify
 *
 * @param {Object} params
 * @param {Object} params.prefs         - User preferences from Firestore (prefsStore.getPrefs)
 * @param {Object} params.announcement  - Normalized announcement object from BSE/NSE scraper
 * @param {string} [params.uid]         - User ID (for logging only)
 *
 * @returns {{ shouldNotify: boolean, reason: string, debug: Object }}
 */
function shouldNotify({ prefs, announcement, uid = 'unknown' }) {
  const catRaw    = (announcement.category    || '').trim();
  const subCatRaw = (announcement.subCategory || '').trim();

  // Pre-compute parent groups
  const catParent    = catRaw    ? resolveCategoryGroup(catRaw)    : null;
  const subCatParent = subCatRaw ? resolveCategoryGroup(subCatRaw) : null;

  // Convert blockedCategories to a Set ONCE — O(1) lookups
  const blockedSet = new Set(
    Array.isArray(prefs?.blockedCategories) ? prefs.blockedCategories : []
  );

  const debug = {
    uid,
    company:          announcement.scriptName || announcement.scriptCode || '?',
    category:         catRaw,
    subCategory:      subCatRaw,
    catParent,
    subCatParent,
    blockedCategories: [...blockedSet],
  };

  // ── Rule 1: Check if parent group of `category` is blocked ──────────────────
  if (catParent && blockedSet.has(catParent)) {
    const decision = { shouldNotify: false, reason: BLOCK_REASONS.BLOCKED_PARENT, debug };
    _log(decision);
    return decision;
  }

  // ── Rule 2: Check if parent group of `subCategory` is blocked ───────────────
  if (subCatParent && subCatParent !== catParent && blockedSet.has(subCatParent)) {
    const decision = { shouldNotify: false, reason: BLOCK_REASONS.BLOCKED_PARENT, debug };
    _log(decision);
    return decision;
  }

  // ── Rule 3: Check if the raw `category` string is explicitly blocked ─────────
  if (catRaw && blockedSet.has(catRaw)) {
    const decision = { shouldNotify: false, reason: BLOCK_REASONS.BLOCKED_CATEGORY, debug };
    _log(decision);
    return decision;
  }

  // ── Rule 4: Check if the raw `subCategory` string is explicitly blocked ──────
  if (subCatRaw && blockedSet.has(subCatRaw)) {
    const decision = { shouldNotify: false, reason: BLOCK_REASONS.BLOCKED_SUBCATEGORY, debug };
    _log(decision);
    return decision;
  }

  // ── All checks passed — notification allowed ─────────────────────────────────
  const decision = { shouldNotify: true, reason: BLOCK_REASONS.ALLOWED, debug };
  _log(decision);
  return decision;
}

/**
 * _log — structured decision log.
 * Every notification decision is logged so you can trace exactly why
 * a notification was sent or blocked. Remove or reduce verbosity in production.
 */
function _log({ shouldNotify, reason, debug }) {
  const icon = shouldNotify ? '✅' : '🚫';
  console.log(
    `[NotifFilter] ${icon} uid=${debug.uid} company="${debug.company}" ` +
    `cat="${debug.category}" subCat="${debug.subCategory}" ` +
    `catParent="${debug.catParent}" subCatParent="${debug.subCatParent}" ` +
    `decision=${reason} blocked=[${debug.blockedCategories.join(', ')}]`
  );
}

module.exports = { shouldNotify, BLOCK_REASONS };
