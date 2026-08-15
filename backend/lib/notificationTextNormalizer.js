'use strict';

/**
 * notificationTextNormalizer.js
 *
 * Responsibility: Raw string → canonical normalized text.
 *
 * Rules:
 *   - null / undefined → ""
 *   - Unicode NFC normalize
 *   - NBSP (\u00A0) and zero-width chars → normal space
 *   - trim
 *   - lowercase
 *   - collapse repeated whitespace
 *   - normalize slash/hyphen spacing (e.g. "AGM/EGM" → "agm/egm", kept intact for exact map)
 *
 * Contract:
 *   - Pure function. Deterministic. Side-effect free.
 *   - No database, no network, no async.
 *   - Given the same input, always returns the same output.
 */

// Pre-compiled replacements (no new RegExp() at runtime)
const _RX_NBSP       = /[\u00A0\u200B\u200C\u200D\uFEFF]/g;  // non-breaking + zero-width
const _RX_WS_MULTI   = /\s{2,}/g;                             // collapse ≥2 spaces

/**
 * normalizeText(value) → string
 *
 * @param {*} value — any value; non-strings are coerced
 * @returns {string} — canonical normalized string
 */
function normalizeText(value) {
  if (value === null || value === undefined) return '';

  let s = String(value);

  // Unicode NFC normalization (handles accented chars, lookalike chars)
  if (s.normalize) s = s.normalize('NFC');

  // Replace non-breaking and zero-width spaces with regular space
  s = s.replace(_RX_NBSP, ' ');

  // Trim and lowercase
  s = s.trim().toLowerCase();

  // Collapse repeated whitespace
  s = s.replace(_RX_WS_MULTI, ' ');

  return s;
}

/**
 * toCanonicalId(label) → string
 *
 * Converts a display label to a safe canonical identifier.
 *
 * "Result"            → "result"
 * "AGM/EGM"           → "agm_egm"
 * "Company Update"    → "company_update"
 * "Limited Review..."  → "limited_review_report"
 * "Insider Trading / SAST" → "insider_trading_sast"
 *
 * @param {string} label
 * @returns {string}
 */
const _RX_UNSAFE = /[^a-z0-9]+/g;  // pre-compiled

function toCanonicalId(label) {
  if (!label) return '';
  let s = normalizeText(label);
  s = s.replace(_RX_UNSAFE, '_');
  // Collapse and trim underscores
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  return s;
}

module.exports = { normalizeText, toCanonicalId };
