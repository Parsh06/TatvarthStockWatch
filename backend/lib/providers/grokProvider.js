'use strict';

/**
 * groqProvider.js
 *
 * Groq provider for StockWatch AI analysis.
 * Uses the OpenAI-compatible chat completions API at api.groq.com.
 *
 * Groq provides ultra-fast inference for open-source models
 * (LLaMA, Mixtral, Gemma) via their custom LPU hardware.
 *
 * Supports:
 * - Text-only prompts (Groq does NOT support multimodal/PDF input)
 * - JSON mode via response_format
 * - 2-model cascade (llama-3.3-70b-versatile → gemma2-9b-it)
 */

const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq model cascade — using currently available models (Sep 2026)
const GROQ_MODELS = [
  'qwen/qwen3.8-27b',       // Fast, strong reasoning, good JSON output
  'openai/gpt-oss-120b',     // Deep reasoning, 131k context
  'openai/gpt-oss-20b',      // Fast fallback
];

/**
 * Calls a single Groq model via OpenAI-compatible API.
 *
 * @param {string} apiKey      - Groq API key (gsk_...)
 * @param {string} modelName   - e.g. 'llama-3.3-70b-versatile'
 * @param {string} prompt      - Full prompt text
 * @param {number} [timeout=12000] - Request timeout in ms
 * @returns {Promise<{ success: boolean, text?: string, model: string, rateLimited?: boolean, error?: string }>}
 */
async function callGroqModel(apiKey, modelName, prompt, timeout = 12000) {
  try {
    const requestBody = {
      model: modelName,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 4096,
    };

    const response = await axios.post(GROQ_API_URL, requestBody, {
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      timeout,
    });

    const rawText = response.data?.choices?.[0]?.message?.content;
    if (!rawText) {
      return { success: false, model: modelName, error: 'Empty response from Groq' };
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
      error: 'Status ' + (statusCode || 'N/A') + ': ' + errMsg,
    };
  }
}

/**
 * Runs the Groq model cascade.
 *
 * NOTE: Groq does NOT support multimodal input (PDFs/images).
 * When a PDF is available, the text-only prompt still includes the filing
 * metadata and PDF link — the AI just can't read the PDF contents directly.
 * This is acceptable because most BSE/NSE filings have sufficient metadata
 * in the announcement text itself.
 *
 * @param {string} prompt      - Full prompt text
 * @param {string|null} _base64Pdf - Ignored (Groq doesn't support multimodal)
 * @param {object} [options]
 * @param {string[]} [options.models] - Override model list
 * @param {number}   [options.timeout] - Per-model timeout in ms
 * @returns {Promise<{ success: boolean, text?: string, model?: string, provider: string, allRateLimited?: boolean, error?: string }>}
 */
async function callGroq(prompt, _base64Pdf, options = {}) {
  const apiKey = process.env.GROK_API_KEY; // env var name kept for backward compat
  if (!apiKey) {
    return { success: false, provider: 'groq', error: 'GROK_API_KEY not configured' };
  }

  const models = options.models || GROQ_MODELS;
  const timeout = options.timeout || 12000;
  let allRateLimited = true;

  for (let i = 0; i < models.length; i++) {
    const modelName = models[i];
    console.log('[GroqProvider] Trying model "' + modelName + '" (tier ' + (i + 1) + '/' + models.length + ')');

    const result = await callGroqModel(apiKey, modelName, prompt, timeout);

    if (result.success) {
      console.log('[GroqProvider] ✅ Model "' + modelName + '" succeeded');
      return { success: true, text: result.text, model: modelName, provider: 'groq' };
    }

    // Track if at least one failure was NOT rate-limiting
    if (!result.rateLimited) {
      allRateLimited = false;
    }

    console.warn('[GroqProvider] Model "' + modelName + '" failed: ' + result.error);

    // Brief delay between models
    if (i < models.length - 1) {
      await new Promise(function(resolve) { setTimeout(resolve, 500); });
    }
  }

  return {
    success: false,
    provider: 'groq',
    allRateLimited: allRateLimited,
    error: 'All ' + models.length + ' Groq models failed',
  };
}

module.exports = {
  GROQ_MODELS,
  callGroq,
  callGroqModel,
};
