'use strict';

/**
 * notificationFilter.js
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SINGLE SOURCE OF TRUTH — All notification eligibility decisions        ║
 * ║  No notification channel (Push, Telegram, In-App) may bypass this.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * BLOCK RULES (evaluated in order — first match wins):
 *
 *   Rule 1 — Parent group of `category` is in blockedCategories
 *   Rule 2 — Parent group of `subCategory` is in blockedCategories
 *   Rule 3 — Raw `category` string is in blockedCategories
 *   Rule 4 — Raw `subCategory` string is in blockedCategories
 *
 *   If ANY rule fires → shouldNotify: false
 *   If ALL rules pass → shouldNotify: true
 *
 * Parent acts as a master switch.
 * There is NO "at least one enabled" logic.
 */

const { resolveCategoryGroup } = require('./alertCategories');

// ── Block reason constants ────────────────────────────────────────────────────
const BLOCK_REASONS = {
  BLOCKED_PARENT:      'BLOCKED_PARENT',      // parent group of category/subCategory is blocked
  BLOCKED_SUBCATEGORY: 'BLOCKED_SUBCATEGORY', // raw subCategory string is blocked
  BLOCKED_CATEGORY:    'BLOCKED_CATEGORY',    // raw category string is blocked
  NOTIFICATIONS_OFF:   'NOTIFICATIONS_OFF',   // user disabled all notifications
  ALLOWED:             'ALLOWED',             // all rules passed — send notification
};

/**
 * shouldNotify
 *
 * @param {Object}  params
 * @param {Object}  params.prefs                 - User preferences from Firestore (prefsStore.getPrefs)
 * @param {Object}  params.announcement           - Normalized announcement object from BSE/NSE scraper
 * @param {string}  [params.uid]                  - User ID (for logging)
 * @param {string}  [params.notificationChannel]  - 'push' | 'telegram' | 'in-app' (for logging)
 *
 * @returns {{
 *   shouldNotify:        boolean,
 *   reason:              string,
 *   matchedCategory:     string,
 *   matchedSubCategory:  string,
 *   blockedBy:           string | null,
 *   notificationChannel: string,
 *   debug:               Object
 * }}
 */
function shouldNotify({ prefs, announcement, uid = 'unknown', notificationChannel = 'unknown' }) {
  const catRaw    = (announcement.category    || '').trim();
  const subCatRaw = (announcement.subCategory || '').trim();

  // Pre-compute parent groups once
  const catParent    = catRaw    ? resolveCategoryGroup(catRaw)    : null;
  const subCatParent = subCatRaw ? resolveCategoryGroup(subCatRaw) : null;

  // Build blocked set — O(1) lookups
  // Lowercase all entries to ensure case-insensitive matching
  const blockedSetLower = new Set(
    (Array.isArray(prefs?.blockedCategories) ? prefs.blockedCategories : [])
      .map(c => c.trim().toLowerCase())
  );
  
  // Keep original casing for debug logs
  const debugBlockedSet = new Set(
    Array.isArray(prefs?.blockedCategories) ? prefs.blockedCategories : []
  );

  const debug = {
    uid,
    announcementId:    String(announcement.id || announcement._id || '?'),
    company:           announcement.scriptName || announcement.scriptCode || '?',
    exchange:          announcement.exchange || '?',
    category:          catRaw,
    subCategory:       subCatRaw,
    catParent,
    subCatParent,
    blockedCategories: [...debugBlockedSet],
    notificationChannel,
  };

  // Helper — build a BLOCKED decision object
  const blocked = (reason, blockedBy) => {
    const decision = {
      shouldNotify:        false,
      reason,
      matchedCategory:     catRaw,
      matchedSubCategory:  subCatRaw,
      blockedBy,
      notificationChannel,
      debug,
    };
    _log(decision);
    return decision;
  };

  // Helper — build an ALLOWED decision object
  const allowed = () => {
    const decision = {
      shouldNotify:        true,
      reason:              BLOCK_REASONS.ALLOWED,
      matchedCategory:     catRaw,
      matchedSubCategory:  subCatRaw,
      blockedBy:           null,
      notificationChannel,
      debug,
    };
    _log(decision);
    return decision;
  };

  // ── Rule 1: parent group of `category` is blocked ────────────────────────────
  if (catParent && blockedSetLower.has(catParent.toLowerCase())) {
    return blocked(BLOCK_REASONS.BLOCKED_PARENT, catParent);
  }

  // ── Rule 2: parent group of `subCategory` is blocked (if different from catParent) ──
  if (subCatParent && subCatParent !== catParent && blockedSetLower.has(subCatParent.toLowerCase())) {
    return blocked(BLOCK_REASONS.BLOCKED_PARENT, subCatParent);
  }

  // ── Rule 3: raw `category` string is blocked ─────────────────────────────────
  if (catRaw && blockedSetLower.has(catRaw.toLowerCase())) {
    return blocked(BLOCK_REASONS.BLOCKED_CATEGORY, catRaw);
  }

  // ── Rule 4: raw `subCategory` string is blocked ──────────────────────────────
  if (subCatRaw && blockedSetLower.has(subCatRaw.toLowerCase())) {
    return blocked(BLOCK_REASONS.BLOCKED_SUBCATEGORY, subCatRaw);
  }

  // ── All rules passed — notification is allowed ────────────────────────────────
  return allowed();
}

/**
 * _log — Emits one structured log line per notification decision.
 *
 * Human-readable prefix + JSON suffix so it is both greppable by eye
 * and parseable by log aggregators (Vercel logs, Datadog, etc).
 */
function _log(decision) {
  const { shouldNotify: allow, reason, blockedBy, notificationChannel, debug } = decision;
  const icon = allow ? '✅' : '🚫';

  console.log("================================");
  console.log("Notification Decision");
  console.log({
    uid: debug.uid,
    company: debug.company,
    category: debug.category,
    subCategory: debug.subCategory,
    blocked: debug.blockedCategories,
    decision: decision
  });
  console.log("================================");

  // Human readable — for quick scanning in Vercel function logs
  console.log(
    `[NotifFilter] ${icon}  uid=${debug.uid}  company="${debug.company}"  ` +
    `exchange=${debug.exchange}  cat="${debug.category}"  subCat="${debug.subCategory}"  ` +
    `catParent="${debug.catParent}"  subCatParent="${debug.subCatParent}"  ` +
    `reason=${reason}  blockedBy=${blockedBy || 'none'}  channel=${notificationChannel}`
  );

  // Structured JSON — for log parsers / future alerting pipelines
  console.log(
    '[NotifFilter:JSON] ' + JSON.stringify({
      uid:              debug.uid,
      announcementId:   debug.announcementId,
      company:          debug.company,
      exchange:         debug.exchange,
      category:         debug.category,
      subCategory:      debug.subCategory,
      catParent:        debug.catParent,
      subCatParent:     debug.subCatParent,
      blockedCategories: debug.blockedCategories,
      shouldNotify:     allow,
      reason,
      blockedBy:        blockedBy || null,
      channel:          notificationChannel,
    })
  );
}

module.exports = { shouldNotify, BLOCK_REASONS };


