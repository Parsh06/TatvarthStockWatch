'use strict';

/**
 * categoryClassifier.js
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  TAXONOMY COMPILER + ANNOUNCEMENT CLASSIFIER                            ║
 * ║                                                                          ║
 * ║  Responsibility:                                                         ║
 * ║    announcement → canonical parentId + subcategoryKey                   ║
 * ║                                                                          ║
 * ║  ARCHITECTURE RULES:                                                     ║
 * ║    1. Taxonomy is compiled ONCE at module load. Never recompiled.        ║
 * ║    2. Runtime decisions use Map.get() / Set.has() → O(1).               ║
 * ║    3. No database, no network, no filesystem, no async.                  ║
 * ║    4. No console.log() in hot path.                                      ║
 * ║    5. Classify each announcement ONCE, reuse for all users.              ║
 * ║                                                                          ║
 * ║  CLASSIFICATION PRIORITY (strict, earlier wins):                         ║
 * ║    1. STRUCTURED  — category + subCategory → exact taxonomy match        ║
 * ║    2. ALIAS       — normalized alias lookup                              ║
 * ║    3. DYNAMIC_PATTERN — controlled regex per parent                      ║
 * ║    4. SUBJECT_FALLBACK — first word/phrase match in subject             ║
 * ║    5. DESCRIPTION_FALLBACK — first word/phrase match in description     ║
 * ║    6. UNKNOWN     — no confident resolution                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const { ALERT_CATEGORIES } = require('./alertCategories');
const { normalizeText, toCanonicalId } = require('./notificationTextNormalizer');

// ─────────────────────────────────────────────────────────────────────────────
// TAXONOMY COMPILATION (runs once at module load)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dynamic variant registry.
 *
 * Each entry: { parentId, subcategoryId, regex }
 * These handle exchange-generated strings that append dates/quarter info.
 *
 * IMPORTANT: Add entries only for known real-world patterns.
 * Do NOT create catch-all matchers.
 *
 * All regex are precompiled here — never constructed inside the hot path.
 */
const DYNAMIC_MATCHERS = [
  // Result → Financial Results
  {
    parentId: 'result',
    subcategoryId: 'financial_results',
    regex: /^financial results(?:\s+(?:for|as on|for the quarter|for q[1-4])\b.*)?$/i,
  },
  // Result → Auditors Report
  {
    parentId: 'result',
    subcategoryId: 'auditors_report',
    regex: /^auditors? report(?:\s+.*)?$/i,
  },
  // Result → Limited Review Report
  {
    parentId: 'result',
    subcategoryId: 'limited_review_report',
    regex: /^limited review report(?:\s+.*)?$/i,
  },
  // Board Meeting → Outcome of Board Meeting
  {
    parentId: 'board_meeting',
    subcategoryId: 'outcome_of_board_meeting',
    regex: /^outcome of board meeting(?:\s+.*)?$/i,
  },
  // AGM/EGM → AGM
  {
    parentId: 'agm_egm',
    subcategoryId: 'agm',
    regex: /^(?:notice of )?(?:the )?\d+(?:st|nd|rd|th)? ?agm(?:\s+.*)?$/i,
  },
  // Corp. Action → Dividend
  {
    parentId: 'corp_action',
    subcategoryId: 'dividend',
    regex: /^dividend(?:\s+.*)?$/i,
  },
  // Corp. Action → Record Date
  {
    parentId: 'corp_action',
    subcategoryId: 'record_date',
    regex: /^record date(?:\s+.*)?$/i,
  },
  // Company Update → Announcement under Regulation 30
  {
    parentId: 'company_update',
    subcategoryId: 'announcement_under_regulation_30',
    regex: /^announcement under regulation(?: 30)?(?:\s+.*)?$/i,
  },
];

/**
 * compileAlertCategories(ALERT_CATEGORIES)
 *
 * Builds all indexes once. Returns an immutable compiled taxonomy.
 *
 * Indexes created:
 *   parentExactMap       Map<normalizedLabel, parentInfo>
 *   subcategoryExactMap  Map<"parentId::normalizedLabel", subcategoryInfo>
 *   subcategoryKeyMap    Map<subcategoryKey, subcategoryInfo>  (for filter compilation)
 *   parentIdMap          Map<parentId, parentInfo>
 *   dynamicMatchers      Array (precompiled, ordered)
 */
function compileAlertCategories(categories) {
  // Maps
  const parentExactMap      = new Map(); // normalized label → { parentId, parentLabel }
  const parentIdMap         = new Map(); // parentId → { parentId, parentLabel, subcategoryIds: Set }
  const subcategoryExactMap = new Map(); // "parentId::normLabel" → { parentId, parentLabel, subcategoryId, subcategoryLabel, subcategoryKey }
  const subcategoryKeyMap   = new Map(); // subcategoryKey → { ...same }
  const allSubcategoryIds   = new Map(); // subcategoryId → [parentId, ...] (track duplicates)

  const warnings = [];

  for (const [parentLabel, children] of Object.entries(categories)) {
    const parentId = toCanonicalId(parentLabel);
    if (!parentId) { warnings.push(`Empty parentLabel: "${parentLabel}"`); continue; }

    const parentInfo = { parentId, parentLabel, subcategoryIds: new Set() };
    parentIdMap.set(parentId, parentInfo);
    parentExactMap.set(normalizeText(parentLabel), parentInfo);

    if (!Array.isArray(children)) {
      warnings.push(`Parent "${parentLabel}" has non-array children`);
      continue;
    }

    for (const childLabel of children) {
      if (!childLabel || typeof childLabel !== 'string') {
        warnings.push(`Empty/non-string child under "${parentLabel}"`);
        continue;
      }

      const subcategoryId  = toCanonicalId(childLabel);
      const subcategoryKey = `${parentId}:${subcategoryId}`;
      const normLabel      = normalizeText(childLabel);
      const lookupKey      = `${parentId}::${normLabel}`;

      const subcatInfo = {
        parentId,
        parentLabel,
        subcategoryId,
        subcategoryLabel: childLabel,
        subcategoryKey,
      };

      parentInfo.subcategoryIds.add(subcategoryId);
      subcategoryExactMap.set(lookupKey, subcatInfo);
      subcategoryKeyMap.set(subcategoryKey, subcatInfo);

      // Track cross-parent duplicates (for warning/policy)
      if (!allSubcategoryIds.has(subcategoryId)) {
        allSubcategoryIds.set(subcategoryId, [parentId]);
      } else {
        allSubcategoryIds.get(subcategoryId).push(parentId);
      }
    }
  }

  // Warn on duplicates (labels that appear under multiple parents)
  for (const [subcatId, parentIds] of allSubcategoryIds) {
    if (parentIds.length > 1) {
      warnings.push(`Subcategory id "${subcatId}" exists under multiple parents: ${parentIds.join(', ')}`);
    }
  }

  if (warnings.length > 0) {
    // Emit taxonomy warnings at startup — never in hot path
    for (const w of warnings) {
      process.nextTick(() => console.warn('[CategoryClassifier:Taxonomy]', w));
    }
  }

  return Object.freeze({
    parentExactMap:      parentExactMap,
    parentIdMap:         parentIdMap,
    subcategoryExactMap: subcategoryExactMap,
    subcategoryKeyMap:   subcategoryKeyMap,
    allSubcategoryIds:   allSubcategoryIds,
    dynamicMatchers:     DYNAMIC_MATCHERS,
  });
}

// Compile once
const TAXONOMY = compileAlertCategories(ALERT_CATEGORIES);

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFICATION SOURCES
// ─────────────────────────────────────────────────────────────────────────────

const CLASSIFICATION_SOURCE = Object.freeze({
  STRUCTURED:          'STRUCTURED',
  ALIAS:               'ALIAS',
  DYNAMIC_PATTERN:     'DYNAMIC_PATTERN',
  SUBJECT_FALLBACK:    'SUBJECT_FALLBACK',
  DESCRIPTION_FALLBACK:'DESCRIPTION_FALLBACK',
  UNKNOWN:             'UNKNOWN',
});

// Unknown result singleton (avoids allocation in hot path)
const UNKNOWN_CLASSIFICATION = Object.freeze({
  parentId:         null,
  parentLabel:      null,
  subcategoryId:    null,
  subcategoryLabel: null,
  subcategoryKey:   null,
  source:           CLASSIFICATION_SOURCE.UNKNOWN,
  confidence:       0,
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS (hot-path, no console.log)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * _makeResult — build a classification result object.
 * Does NOT freeze at runtime to avoid allocation overhead.
 */
function _makeResult(subcatInfo, source, confidence) {
  return {
    parentId:         subcatInfo.parentId,
    parentLabel:      subcatInfo.parentLabel,
    subcategoryId:    subcatInfo.subcategoryId,
    subcategoryLabel: subcatInfo.subcategoryLabel,
    subcategoryKey:   subcatInfo.subcategoryKey,
    source,
    confidence,
  };
}

function _makeParentOnlyResult(parentInfo, source, confidence) {
  return {
    parentId:         parentInfo.parentId,
    parentLabel:      parentInfo.parentLabel,
    subcategoryId:    null,
    subcategoryLabel: null,
    subcategoryKey:   null,
    source,
    confidence,
  };
}

/**
 * _resolveByParentAndSub — resolve using parent + child pair.
 * Returns subcatInfo or null.
 *
 * @param {string} normParent — normalized parent string
 * @param {string} normChild  — normalized child string
 */
function _resolveByParentAndSub(normParent, normChild) {
  // Step 1: Find the parent
  const parentInfo = TAXONOMY.parentExactMap.get(normParent);
  if (!parentInfo) return null;

  // Step 2: Look up child under this parent
  const lookupKey = `${parentInfo.parentId}::${normChild}`;
  return TAXONOMY.subcategoryExactMap.get(lookupKey) || null;
}

/**
 * _resolveParentOnly — find parent by normalized label.
 * Returns parentInfo or null.
 */
function _resolveParentOnly(normLabel) {
  return TAXONOMY.parentExactMap.get(normLabel) || null;
}

/**
 * _resolveSubcategoryGlobal — find a subcategory by its normalized label
 * across all parents. Returns the subcatInfo if exactly one parent owns it,
 * or returns the one under the given preferredParentId if provided.
 *
 * Used for legacy `blockedCategories` entries that only contain the child label.
 *
 * @param {string} normLabel
 * @param {string|null} preferredParentId — narrow to a specific parent if ambiguous
 */
function _resolveSubcategoryGlobal(normLabel, preferredParentId) {
  // Try each parent in order
  let found = null;
  for (const [parentId, parentInfo] of TAXONOMY.parentIdMap) {
    const lookupKey = `${parentId}::${normLabel}`;
    const subcatInfo = TAXONOMY.subcategoryExactMap.get(lookupKey);
    if (subcatInfo) {
      // If preferred parent matches, return immediately
      if (preferredParentId && parentId === preferredParentId) return subcatInfo;
      if (!found) found = subcatInfo;
    }
  }
  return found;
}

/**
 * _tryDynamicMatchers — scan parent-specific dynamic matchers for a normalized string.
 * Returns subcatInfo or null.
 *
 * @param {string} normParentId — canonical parent id to narrow matcher list
 * @param {string} normSubcat   — normalized raw subcategory string
 */
function _tryDynamicMatchers(normParentId, normSubcat) {
  for (const matcher of TAXONOMY.dynamicMatchers) {
    if (matcher.parentId !== normParentId) continue;
    if (matcher.regex.test(normSubcat)) {
      const subcategoryKey = `${matcher.parentId}:${matcher.subcategoryId}`;
      return TAXONOMY.subcategoryKeyMap.get(subcategoryKey) || null;
    }
  }
  return null;
}

/**
 * _tryFallbackText — attempt to classify from free text (subject / description).
 * Very conservative: only matches if first N chars align with a known taxonomy label.
 *
 * @param {string} text — normalized text to match against
 * @param {string|null} preferredParentId — if we know the parent, narrow lookup
 */
function _tryFallbackText(text, preferredParentId) {
  if (!text) return null;

  // Try global subcategory lookup with preferred parent
  const normText = text;  // already normalized by caller
  const subcatInfo = _resolveSubcategoryGlobal(normText, preferredParentId);
  if (subcatInfo) return subcatInfo;

  // Try parent-only match
  const parentInfo = _resolveParentOnly(normText);
  if (parentInfo) return { _parentOnly: true, parentInfo };

  // Controlled prefix matching — only for DYNAMIC_MATCHERS parents
  if (preferredParentId) {
    const matchResult = _tryDynamicMatchers(preferredParentId, text);
    if (matchResult) return matchResult;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API: classifyAnnouncement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * classifyAnnouncement
 *
 * Classifies one announcement into { parentId, subcategoryKey, ... }.
 *
 * THIS IS THE HOT PATH — no console.log, no async, no DB.
 *
 * Classification priority (first match wins, never overridden by lower tier):
 *   1. STRUCTURED  — category + subCategory → exact taxonomy match
 *   2. DYNAMIC_PATTERN — controlled regex match
 *   3. ALIAS (parent-only if subCategory unknown)
 *   4. SUBJECT_FALLBACK
 *   5. DESCRIPTION_FALLBACK
 *   6. UNKNOWN
 *
 * @param {{ category, subCategory, subject, description }} input
 * @returns {ClassificationResult}
 */
function classifyAnnouncement({ category, subCategory, subject, description } = {}) {
  try {
    const normCat    = normalizeText(category);
    const normSubCat = normalizeText(subCategory);

    // ── Priority 1: STRUCTURED — exact taxonomy match on category + subCategory ──
    if (normCat && normSubCat) {
      const exact = _resolveByParentAndSub(normCat, normSubCat);
      if (exact) return _makeResult(exact, CLASSIFICATION_SOURCE.STRUCTURED, 1);
    }

    // ── Priority 2: DYNAMIC_PATTERN via category (parent) + subCategory variant ──
    if (normCat && normSubCat) {
      const parentInfo = _resolveParentOnly(normCat);
      if (parentInfo) {
        const dynamic = _tryDynamicMatchers(parentInfo.parentId, normSubCat);
        if (dynamic) return _makeResult(dynamic, CLASSIFICATION_SOURCE.DYNAMIC_PATTERN, 1);
      }
    }

    // ── Priority 3: category alone resolves a parent; subCategory absent ─────────
    if (normCat) {
      const parentInfo = _resolveParentOnly(normCat);
      if (parentInfo) {
        // category IS a parent label, subCategory unknown/missing
        if (!normSubCat) {
          return _makeParentOnlyResult(parentInfo, CLASSIFICATION_SOURCE.STRUCTURED, 0.8);
        }
      }

      // category IS a raw subcategory label (e.g. BSE sends "Financial Results" in category field)
      const subcatAsParent = _resolveSubcategoryGlobal(normCat, null);
      if (subcatAsParent) return _makeResult(subcatAsParent, CLASSIFICATION_SOURCE.STRUCTURED, 0.9);
    }

    // ── Priority 4: subCategory alone resolves ────────────────────────────────────
    if (normSubCat) {
      // Try dynamic matchers with unknown parent
      for (const matcher of TAXONOMY.dynamicMatchers) {
        if (matcher.regex.test(normSubCat)) {
          const subcategoryKey = `${matcher.parentId}:${matcher.subcategoryId}`;
          const subInfo = TAXONOMY.subcategoryKeyMap.get(subcategoryKey);
          if (subInfo) return _makeResult(subInfo, CLASSIFICATION_SOURCE.DYNAMIC_PATTERN, 0.9);
        }
      }

      // Global exact subcategory lookup
      const globalSub = _resolveSubcategoryGlobal(normSubCat, null);
      if (globalSub) return _makeResult(globalSub, CLASSIFICATION_SOURCE.ALIAS, 0.8);
    }

    // ── Priority 5: SUBJECT_FALLBACK (only if structured classification unavailable) ──
    const normSubject = normalizeText(subject);
    if (normSubject) {
      // Try to extract first meaningful phrase — check against taxonomy
      const subjectResult = _tryFallbackText(normSubject, null);
      if (subjectResult) {
        if (subjectResult._parentOnly) {
          return _makeParentOnlyResult(subjectResult.parentInfo, CLASSIFICATION_SOURCE.SUBJECT_FALLBACK, 0.5);
        }
        return _makeResult(subjectResult, CLASSIFICATION_SOURCE.SUBJECT_FALLBACK, 0.5);
      }
    }

    // ── Priority 6: DESCRIPTION_FALLBACK ──────────────────────────────────────────
    const normDesc = normalizeText(description);
    if (normDesc) {
      const descResult = _tryFallbackText(normDesc, null);
      if (descResult) {
        if (descResult._parentOnly) {
          return _makeParentOnlyResult(descResult.parentInfo, CLASSIFICATION_SOURCE.DESCRIPTION_FALLBACK, 0.3);
        }
        return _makeResult(descResult, CLASSIFICATION_SOURCE.DESCRIPTION_FALLBACK, 0.3);
      }
    }

    // ── Priority 7: UNKNOWN ────────────────────────────────────────────────────────
    return UNKNOWN_CLASSIFICATION;

  } catch (err) {
    // Defensive: never crash notification processing over one bad announcement
    process.nextTick(() => console.error('[CategoryClassifier] Unexpected error:', err.message));
    return UNKNOWN_CLASSIFICATION;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH CLASSIFICATION (classify once, reuse for all users)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * classifyAnnouncementBatch
 *
 * Classifies an array of announcements once and returns classified pairs.
 * Attach classification to the pair — NOT to the MongoDB document.
 *
 * @param {Object[]} announcements
 * @returns {{ announcement: Object, classification: Object }[]}
 */
function classifyAnnouncementBatch(announcements) {
  const result = [];
  for (const ann of announcements) {
    let classification;
    try {
      classification = classifyAnnouncement({
        category:    ann.category,
        subCategory: ann.subCategory,
        subject:     ann.subject,
        description: ann.description,
      });
    } catch (err) {
      classification = UNKNOWN_CLASSIFICATION;
    }
    result.push({ announcement: ann, classification });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAXONOMY QUERY HELPERS (used by filter compiler & tests)
// ─────────────────────────────────────────────────────────────────────────────

/** Get all parent IDs */
function getAllParentIds() {
  return [...TAXONOMY.parentIdMap.keys()];
}

/** Get parentId for a display label */
function getParentId(label) {
  return TAXONOMY.parentExactMap.get(normalizeText(label))?.parentId || null;
}

/** Get subcategoryKey for a parent+child pair */
function getSubcategoryKey(parentLabel, childLabel) {
  const parentId = toCanonicalId(parentLabel);
  const childId  = toCanonicalId(childLabel);
  return `${parentId}:${childId}`;
}

/** Check if a subcategoryKey exists in taxonomy */
function isKnownSubcategoryKey(subcategoryKey) {
  return TAXONOMY.subcategoryKeyMap.has(subcategoryKey);
}

/** Get all subcategory keys under a parentId */
function getSubcategoryKeysForParent(parentId) {
  const parentInfo = TAXONOMY.parentIdMap.get(parentId);
  if (!parentInfo) return [];
  const keys = [];
  for (const subcategoryId of parentInfo.subcategoryIds) {
    keys.push(`${parentId}:${subcategoryId}`);
  }
  return keys;
}

module.exports = {
  TAXONOMY,
  CLASSIFICATION_SOURCE,
  UNKNOWN_CLASSIFICATION,
  classifyAnnouncement,
  classifyAnnouncementBatch,
  getAllParentIds,
  getParentId,
  getSubcategoryKey,
  isKnownSubcategoryKey,
  getSubcategoryKeysForParent,
  _resolveSubcategoryGlobal, // exported for filter compilation
};
