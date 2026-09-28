'use strict';

/**
 * providerRouter.js
 *
 * Smart AI provider router for StockWatch.
 * Routes AI analysis requests between Gemini (primary, free) and Grok (failover, paid).
 *
 * Strategy: Adaptive Primary-Failover
 * - Gemini is primary (free tier — use as much as possible)
 * - Grok is failover (paid — only when Gemini can't serve)
 * - Cooldown mechanism: after consecutive Gemini failures, Grok becomes
 *   temporary primary for a cooling period
 * - Both providers use the exact same prompt and output schema
 *
 * Cooldown Tiers:
 *   1-2 consecutive fails → no cooldown, just failover for this request
 *   3-5 consecutive fails → 5 minute cooldown (Grok becomes primary)
 *   6+  consecutive fails → 15 minute cooldown
 */

const { callGemini } = require('./geminiProvider');
const { callGroq } = require('./grokProvider');

// ── Cooldown State ──────────────────────────────────────────────────────────
let geminiCooldownUntil = 0;        // Timestamp (ms) when cooldown expires
let geminiConsecutiveFails = 0;     // Number of consecutive Gemini cascade failures
let lastProviderUsed = null;        // For logging/observability

// Cooldown durations in milliseconds
const COOLDOWN_SHORT = 5 * 60 * 1000;   // 5 minutes
const COOLDOWN_LONG = 15 * 60 * 1000;   // 15 minutes

/**
 * Checks if Gemini is currently in cooldown.
 * @returns {boolean}
 */
function isGeminiInCooldown() {
  return Date.now() < geminiCooldownUntil;
}

/**
 * Records a Gemini failure and potentially sets cooldown.
 * @param {boolean} wasRateLimited - Whether the failure was due to rate limiting
 */
function recordGeminiFailure(wasRateLimited) {
  geminiConsecutiveFails++;

  if (wasRateLimited && geminiConsecutiveFails >= 6) {
    geminiCooldownUntil = Date.now() + COOLDOWN_LONG;
    console.warn(`[ProviderRouter] Gemini cooldown: 15 min (${geminiConsecutiveFails} consecutive fails)`);
  } else if (wasRateLimited && geminiConsecutiveFails >= 3) {
    geminiCooldownUntil = Date.now() + COOLDOWN_SHORT;
    console.warn(`[ProviderRouter] Gemini cooldown: 5 min (${geminiConsecutiveFails} consecutive fails)`);
  }
}

/**
 * Records a Gemini success — resets failure counter and cooldown.
 */
function recordGeminiSuccess() {
  geminiConsecutiveFails = 0;
  geminiCooldownUntil = 0;
}

/**
 * Routes an AI analysis request to the best available provider.
 *
 * @param {string} prompt      - Full prompt text (includes AI_ANALYST_PROMPT + filing metadata)
 * @param {string|null} base64Pdf - Base64-encoded PDF or null
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, text?: string, model?: string, provider?: string, error?: string } | null>}
 */
async function routeRequest(prompt, base64Pdf, options = {}) {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);
  const hasGroq = Boolean(process.env.GROK_API_KEY);

  // ── Case: No providers configured ─────────────────────────────────────────
  if (!hasGemini && !hasGroq) {
    console.warn('[ProviderRouter] No AI providers configured (neither GEMINI_API_KEY nor GROK_API_KEY)');
    return null;
  }

  // ── Case: Only Grok configured ────────────────────────────────────────────
  if (!hasGemini && hasGroq) {
    console.log('[ProviderRouter] Only Groq configured → routing to Groq');
    const result = await callGroq(prompt, base64Pdf, options);
    lastProviderUsed = 'groq';
    return result.success ? result : null;
  }

  // ── Case: Only Gemini configured ──────────────────────────────────────────
  if (hasGemini && !hasGroq) {
    console.log('[ProviderRouter] Only Gemini configured → routing to Gemini');
    const result = await callGemini(prompt, base64Pdf, options);
    lastProviderUsed = 'gemini';
    if (result.success) {
      recordGeminiSuccess();
      return result;
    }
    return null;
  }

  // ── Case: Both providers configured (primary-failover) ────────────────────
  const inCooldown = isGeminiInCooldown();

  if (inCooldown) {
    // Gemini is cooling down → try Grok first
    const cooldownRemaining = Math.ceil((geminiCooldownUntil - Date.now()) / 1000);
    console.log(`[ProviderRouter] Gemini in cooldown (${cooldownRemaining}s remaining) → trying Groq first`);

    const grokResult = await callGroq(prompt, base64Pdf, options);
    if (grokResult.success) {
      lastProviderUsed = 'groq';
      return grokResult;
    }

    // Grok also failed → try Gemini anyway (cooldown is advisory, not hard block)
    console.log('[ProviderRouter] Groq failed during Gemini cooldown → trying Gemini as last resort');
    const geminiResult = await callGemini(prompt, base64Pdf, options);
    if (geminiResult.success) {
      recordGeminiSuccess();
      lastProviderUsed = 'gemini';
      return geminiResult;
    }

    recordGeminiFailure(geminiResult.allRateLimited);
    return null;
  }

  // Normal flow: Gemini first → Grok failover
  console.log('[ProviderRouter] Trying Gemini (primary)...');
  const geminiResult = await callGemini(prompt, base64Pdf, options);

  if (geminiResult.success) {
    recordGeminiSuccess();
    lastProviderUsed = 'gemini';
    return geminiResult;
  }

  // Gemini failed → record and try Grok
  recordGeminiFailure(geminiResult.allRateLimited);
  console.log('[ProviderRouter] Gemini failed → failing over to Groq...');

  const grokResult = await callGroq(prompt, base64Pdf, options);
  if (grokResult.success) {
    lastProviderUsed = 'groq';
    return grokResult;
  }

  // Both failed
  console.warn('[ProviderRouter] ❌ Both Gemini and Groq failed');
  return null;
}

/**
 * Returns the current health/status of the provider router.
 * Useful for diagnostics and health endpoints.
 */
function getRouterStatus() {
  return {
    geminiCooldownActive: isGeminiInCooldown(),
    geminiCooldownRemainingMs: Math.max(0, geminiCooldownUntil - Date.now()),
    geminiConsecutiveFails,
    lastProviderUsed,
    hasGemini: Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
    hasGroq: Boolean(process.env.GROK_API_KEY),
  };
}

module.exports = {
  routeRequest,
  getRouterStatus,
  isGeminiInCooldown,
};
