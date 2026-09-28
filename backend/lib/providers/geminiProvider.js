'use strict';

/**
 * geminiProvider.js
 *
 * Gemini (Google AI) provider for StockWatch AI analysis.
 * Extracted from aiSummarizer.js — handles the 6-model cascade
 * via direct REST API calls to generativelanguage.googleapis.com.
 *
 * Returns a standardized result object so providerRouter can
 * treat all providers uniformly.
 */

const axios = require('axios');

// ── Active Gemini Model Cascade (Fast failover to Groq) ───────────────────
const GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Calls a single Gemini model via REST API.
 *
 * @param {string} apiKey      - Gemini API key
 * @param {string} modelName   - e.g. 'gemini-3.1-flash-lite'
 * @param {string} prompt      - Full prompt text
 * @param {string|null} base64Pdf - Base64-encoded PDF or null
 * @param {number} [timeout=8000] - Request timeout in ms
 * @returns {Promise<{ success: boolean, text?: string, model: string, rateLimited?: boolean, error?: string }>}
 */
async function callGeminiModel(apiKey, modelName, prompt, base64Pdf, timeout = 8000) {
  try {
    const parts = [];
    if (base64Pdf) {
      parts.push({ inline_data: { mime_type: 'application/pdf', data: base64Pdf } });
    }
    parts.push({ text: prompt });

    const url = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;
    const response = await axios.post(url, {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }, { timeout });

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return { success: false, model: modelName, error: 'Empty response from Gemini' };
    }

    return { success: true, text: rawText, model: modelName };
  } catch (err) {
    const statusCode = err?.response?.status || err?.status;
    const errMsg = err?.response?.data?.error?.message || err?.message || 'Unknown error';
    const isRateLimited = statusCode === 429 || statusCode === 503;

    return {
      success: false,
      model: modelName,
      rateLimited: isRateLimited,
      error: `Status ${statusCode || 'N/A'}: ${errMsg}`,
    };
  }
}

/**
 * Runs the full Gemini model cascade.
 * Tries each model in order, with 1s delay between tiers on failure.
 *
 * @param {string} prompt      - Full prompt text
 * @param {string|null} base64Pdf - Base64-encoded PDF or null
 * @param {object} [options]
 * @param {string[]} [options.models] - Override model cascade
 * @param {number}   [options.timeout] - Per-model timeout in ms
 * @returns {Promise<{ success: boolean, text?: string, model?: string, provider: string, allRateLimited?: boolean, error?: string }>}
 */
async function callGemini(prompt, base64Pdf, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, provider: 'gemini', error: 'GEMINI_API_KEY not configured' };
  }

  const models = options.models || GEMINI_MODELS;
  const timeout = options.timeout || (base64Pdf ? 9500 : 5000);
  let allRateLimited = true;

  for (let i = 0; i < models.length; i++) {
    const modelName = models[i];
    console.log(`[GeminiProvider] Trying model "${modelName}" (tier ${i + 1}/${models.length})`);

    const result = await callGeminiModel(apiKey, modelName, prompt, base64Pdf, timeout);

    if (result.success) {
      console.log(`[GeminiProvider] ✅ Model "${modelName}" succeeded`);
      return { success: true, text: result.text, model: modelName, provider: 'gemini' };
    }

    // Track if at least one failure was NOT rate-limiting (e.g. bad JSON, timeout)
    if (!result.rateLimited) {
      allRateLimited = false;
    }

    console.warn(`[GeminiProvider] Model "${modelName}" failed: ${result.error}`);
  }

  return {
    success: false,
    provider: 'gemini',
    allRateLimited,
    error: `All ${models.length} Gemini models failed`,
  };
}

module.exports = {
  GEMINI_MODELS,
  callGemini,
  callGeminiModel,
};
