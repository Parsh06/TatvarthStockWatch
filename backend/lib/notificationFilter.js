'use strict';

/**
 * notificationFilter.js  [v2 — STRICT HIERARCHICAL ENGINE]
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SINGLE SOURCE OF TRUTH — All notification eligibility decisions        ║
 * ║  No notification channel (Push, Telegram, In-App) may bypass this.      ║
 * ║                                                                          ║
 * ║  ARCHITECTURE CONTRACT:                                                  ║
 * ║    1. shouldNotify() is the HOT PATH — O(1) Set lookups only.           ║
 * ║    2. compileBlockedFilter() runs ONCE PER USER PER CYCLE.              ║
 * ║    3. classifyAnnouncement() runs ONCE PER ANNOUNCEMENT.                ║
 * ║    4. NO regex, NO iteration inside shouldNotify().                      ║
 * ║    5. NO database, NO network, NO async anywhere in this file.          ║
 * ║    6. NO console.log() in hot path.                                     ║
 * ║                                                                          ║
 * ║  FILTER DECISION ORDER (first match wins):                               ║
 * ║    1. PARENT_CATEGORY_BLOCKED — parent Set.has()                        ║
 * ║    2. SUBCATEGORY_BLOCKED     — subcategoryKey Set.has()                ║
 * ║    3. UNKNOWN_CLASSIFICATION  — classification missing                  ║
 * ║    4. ALLOWED                                                            ║
 * ║                                                                          ║
 * ║  SIBLING ISOLATION GUARANTEE:                                           ║
 * ║    Blocking subcategory A NEVER blocks sibling subcategory B            ║
 * ║    even if they share a parent category.                                 ║
 * ║                                                                          ║
 * ║  FALSE POSITIVE PREVENTION:                                             ║
 * ║    Subject/description text is NEVER used for filtering decisions        ║
 * ║    when structured classification (category+subCategory) is available.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const {
  TAXONOMY,
  CLASSIFICATION_SOURCE,
  UNKNOWN_CLASSIFICATION,
  classifyAnnouncement,
  getParentId,
  getSubcategoryKeysForParent,
  _resolveSubcategoryGlobal,
} = require('./categoryClassifier');
const { normalizeText, toCanonicalId } = require('./notificationTextNormalizer');

// ─────────────────────────────────────────────────────────────────────────────
// FILTER REASON CONSTANTS (frozen — no typo risk)
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_REASONS = Object.freeze({
  ALLOWED:                    'ALLOWED',
  PARENT_CATEGORY_BLOCKED:    'PARENT_CATEGORY_BLOCKED',
  SUBCATEGORY_BLOCKED:        'SUBCATEGORY_BLOCKED',
  UNKNOWN_CLASSIFICATION:     'UNKNOWN_CLASSIFICATION',
  SCOPE_DISABLED:             'SCOPE_DISABLED',
  FILTER_ERROR:               'FILTER_ERROR',
});

// Legacy aliases for backward compatibility
const BLOCK_REASONS = Object.freeze({
  ALLOWED:             FILTER_REASONS.ALLOWED,
  BLOCKED_PARENT:      FILTER_REASONS.PARENT_CATEGORY_BLOCKED,
  BLOCKED_SUBCATEGORY: FILTER_REASONS.SUBCATEGORY_BLOCKED,
  BLOCKED_CATEGORY:    FILTER_REASONS.SUBCATEGORY_BLOCKED,
  NOTIFICATIONS_OFF:   FILTER_REASONS.SCOPE_DISABLED,
});

// ─────────────────────────────────────────────────────────────────────────────
// USER FILTER COMPILATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * compileBlockedFilter(blockedCategories)
 *
 * Converts a user's raw blockedCategories array into precompiled Sets
 * for O(1) hot-path lookups.
 *
 * Run ONCE per user per notification cycle — NOT once per announcement.
 *
 * Handles:
 *   - Legacy strings (parent label or child label, any case)
 *   - Ambiguous subcategories (same label under multiple parents)
 *
 * @param {string[]} blockedCategories — raw strings from Firestore prefs
 * @returns {{
 *   parentIds: Set<string>,
 *   subcategoryKeys: Set<string>,
 *   rawNormalizedValues: Set<string>
 * }}
 */
function compileBlockedFilter(blockedCategories) {
  const parentIds          = new Set();
  const subcategoryKeys    = new Set();
  const rawNormalizedValues = new Set();

  const arr = Array.isArray(blockedCategories) ? blockedCategories : [];

  for (const raw of arr) {
    if (!raw || typeof raw !== 'string') continue;
    const norm = normalizeText(raw);
    if (!norm) continue;

    rawNormalizedValues.add(norm);

    // Check if it's a known parent label
    const parentInfo = TAXONOMY.parentExactMap.get(norm);
    if (parentInfo) {
      parentIds.add(parentInfo.parentId);
      // Also add all subcategory keys under this parent (for fast filtering)
      for (const subcatId of parentInfo.subcategoryIds) {
        subcategoryKeys.add(`${parentInfo.parentId}:${subcatId}`);
      }
      continue;
    }

    // Check if it's a canonical parent ID
    const parentById = TAXONOMY.parentIdMap.get(toCanonicalId(raw));
    if (parentById) {
      parentIds.add(parentById.parentId);
      for (const subcatId of parentById.subcategoryIds) {
        subcategoryKeys.add(`${parentById.parentId}:${subcatId}`);
      }
      continue;
    }

    // Check if it's a known subcategory label (global lookup, handles duplicates)
    const subcatInfo = _resolveSubcategoryGlobal(norm, null);
    if (subcatInfo) {
      subcategoryKeys.add(subcatInfo.subcategoryKey);
      continue;
    }

    // Unrecognized label — add normalized raw value as a fallback
    // This covers custom strings the user may have stored
    rawNormalizedValues.add(norm);
  }

  return Object.freeze({ parentIds, subcategoryKeys, rawNormalizedValues });
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER HOT PATH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shouldNotify — STRICT CATEGORY FILTER (hot path)
 *
 * Accepts either:
 *   (a) { compiledFilter, classification } — NEW preferred API (O(1))
 *   (b) { prefs, announcement, uid, notificationChannel } — LEGACY API (backward-compatible)
 *
 * Returns:
 * {
 *   shouldNotify: boolean,   (legacy compat)
 *   allowed: boolean,        (new API)
 *   reason: string,
 *   classification: Object,
 *   blockedBy: string|null,
 *   matchedCategory: string,
 *   matchedSubCategory: string,
 *   notificationChannel: string
 * }
 *
 * SIBLING ISOLATION: Blocking subcategory A NEVER blocks sibling B.
 * FALSE POSITIVE PREVENTION: Structured classification always wins over subject text.
 */
function shouldNotify({
  // New preferred API
  compiledFilter,
  classification,
  // Legacy API
  prefs,
  announcement,
  uid = 'unknown',
  notificationChannel = 'unknown',
} = {}) {
  try {
    // ── Resolve to new API if called via legacy params ──────────────────────
    let filter = compiledFilter;
    let cls    = classification;
    let annObj = announcement || {};

    if (!filter && prefs) {
      filter = compileBlockedFilter(prefs.blockedCategories);
    }

    if (!cls && annObj) {
      cls = classifyAnnouncement({
        category:    annObj.category,
        subCategory: annObj.subCategory,
        subject:     annObj.subject,
        description: annObj.description,
      });
    }

    if (!filter) {
      // Fail closed — cannot determine filter
      return _blocked(FILTER_REASONS.FILTER_ERROR, null, cls, annObj, notificationChannel);
    }

    // ── Handle NONE scope (already handled by engine, but defensive) ────────
    if (!cls || cls.source === CLASSIFICATION_SOURCE.UNKNOWN) {
      // UNKNOWN_CLASSIFICATION: do NOT block (false positive prevention)
      // UNLESS the raw category string is in the raw normalized values
      const rawCatNorm = normalizeText(annObj.category || '');
      const rawSubNorm = normalizeText(annObj.subCategory || '');

      if (rawCatNorm && filter.rawNormalizedValues.has(rawCatNorm)) {
        return _blocked(FILTER_REASONS.SUBCATEGORY_BLOCKED, rawCatNorm, cls, annObj, notificationChannel);
      }
      if (rawSubNorm && filter.rawNormalizedValues.has(rawSubNorm)) {
        return _blocked(FILTER_REASONS.SUBCATEGORY_BLOCKED, rawSubNorm, cls, annObj, notificationChannel);
      }

      return _allowed(cls, annObj, notificationChannel);
    }

    // ── HOT PATH: O(1) Set lookups ──────────────────────────────────────────

    // Priority 1: Parent category blocked (master switch)
    if (cls.parentId && filter.parentIds.has(cls.parentId)) {
      return _blocked(FILTER_REASONS.PARENT_CATEGORY_BLOCKED, cls.parentLabel, cls, annObj, notificationChannel);
    }

    // Priority 2: Exact canonical subcategory blocked
    if (cls.subcategoryKey && filter.subcategoryKeys.has(cls.subcategoryKey)) {
      return _blocked(FILTER_REASONS.SUBCATEGORY_BLOCKED, cls.subcategoryLabel, cls, annObj, notificationChannel);
    }

    // Priority 3: All checks passed — ALLOW
    return _allowed(cls, annObj, notificationChannel);

  } catch (err) {
    // Defensive catch — never crash notification run
    return {
      shouldNotify: true,  // fail open on unexpected error (log it)
      allowed: true,
      reason: FILTER_REASONS.FILTER_ERROR,
      classification: UNKNOWN_CLASSIFICATION,
      blockedBy: null,
      matchedCategory: '',
      matchedSubCategory: '',
      notificationChannel,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT BUILDERS (keep hot path tidy)
// ─────────────────────────────────────────────────────────────────────────────

function _blocked(reason, blockedBy, cls, ann, channel) {
  return {
    shouldNotify:        false,
    allowed:             false,
    reason,
    classification:      cls || UNKNOWN_CLASSIFICATION,
    blockedBy:           blockedBy || null,
    matchedCategory:     (ann && ann.category) ? ann.category : '',
    matchedSubCategory:  (ann && ann.subCategory) ? ann.subCategory : '',
    notificationChannel: channel,
  };
}

function _allowed(cls, ann, channel) {
  return {
    shouldNotify:        true,
    allowed:             true,
    reason:              FILTER_REASONS.ALLOWED,
    classification:      cls || UNKNOWN_CLASSIFICATION,
    blockedBy:           null,
    matchedCategory:     (ann && ann.category) ? ann.category : '',
    matchedSubCategory:  (ann && ann.subCategory) ? ann.subCategory : '',
    notificationChannel: channel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * debugNotificationFilter
 *
 * Returns a rich debug object showing every step of the filtering decision.
 * NOT for use in production hot path — use in admin debug endpoints only.
 *
 * @param {{ announcement: Object, blockedCategories: string[] }} params
 * @returns {Object}
 */
function debugNotificationFilter({ announcement, blockedCategories = [] }) {
  const compiledFilter = compileBlockedFilter(blockedCategories);
  const classification = classifyAnnouncement({
    category:    announcement.category,
    subCategory: announcement.subCategory,
    subject:     announcement.subject,
    description: announcement.description,
  });

  const decision = shouldNotify({ compiledFilter, classification, announcement });

  return {
    input: {
      category:    announcement.category,
      subCategory: announcement.subCategory,
      subject:     announcement.subject,
    },
    normalizedCategory:    normalizeText(announcement.category || ''),
    normalizedSubcategory: normalizeText(announcement.subCategory || ''),
    classification,
    compiledFilter: {
      parentIds:       [...compiledFilter.parentIds],
      subcategoryKeys: [...compiledFilter.subcategoryKeys],
    },
    parentBlocked:    compiledFilter.parentIds.has(classification.parentId),
    subcatBlocked:    compiledFilter.subcategoryKeys.has(classification.subcategoryKey),
    result:           decision.allowed ? 'ALLOWED' : 'BLOCKED',
    reason:           decision.reason,
    blockedBy:        decision.blockedBy,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD-COMPATIBLE resolveCategoryGroup WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * resolveCategoryGroup — legacy compatibility wrapper.
 *
 * Delegates to the new classifier's taxonomy but preserves the old API contract:
 *   resolveCategoryGroup("Financial Results") → "Result"
 *   resolveCategoryGroup("Unknown String")    → "Unknown String"
 *
 * @param {string} categoryStr
 * @returns {string}
 */
function resolveCategoryGroup(categoryStr) {
  if (!categoryStr) return 'Others';
  const norm = normalizeText(categoryStr);

  // Check parent first
  const parentInfo = TAXONOMY.parentExactMap.get(norm);
  if (parentInfo) return parentInfo.parentLabel;

  // Check subcategory (global)
  const subcatInfo = _resolveSubcategoryGlobal(norm, null);
  if (subcatInfo) return subcatInfo.parentLabel;

  return categoryStr; // Preserve original for unknown strings (legacy behavior)
}

module.exports = {
  shouldNotify,
  compileBlockedFilter,
  debugNotificationFilter,
  resolveCategoryGroup,
  FILTER_REASONS,
  BLOCK_REASONS, // legacy export
};
