'use strict';

const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const { AI_ANALYST_PROMPT } = require('./prompts');

// ── 5-Tier Gemini Model Cascade ──────────────────────────────────────────────
// Priority order:
// 1. gemini-2.5-flash      - Best multi-page vision reasoning & structured synthesis
// 2. gemini-2.0-flash      - High speed, reliable, rich extraction
// 3. gemini-1.5-flash      - Large context window, high stability fallback
// 4. gemini-3.1-flash-lite - Fast, lightweight
// 5. gemini-3.5-flash-lite - Emergency ultra-low latency fallback
const MODEL_CASCADE = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

// Lazily initialized Gemini SDK client
let _aiClient = null;

function getAiClient() {
  if (!_aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (apiKey) {
      _aiClient = new GoogleGenAI({ apiKey });
    }
  }
  return _aiClient;
}

/**
 * Downloads a filing PDF from a URL and returns a base64 encoded string.
 */
async function downloadPdfAsBase64(pdfUrl) {
  try {
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream,*/*',
      },
      timeout: 20000,
    });
    return Buffer.from(response.data).toString('base64');
  } catch (err) {
    console.error(`[aiSummarizer] Failed to download PDF: ${pdfUrl}`, err.message);
    return null;
  }
}

/**
 * Normalizes and validates the AI analysis JSON output against required structure.
 */
function normalizeAnalysisOutput(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    executiveSummary: typeof raw.executiveSummary === 'string' ? raw.executiveSummary : 'Executive summary unavailable.',
    announcementCategory: typeof raw.announcementCategory === 'string' ? raw.announcementCategory : 'General Updates',
    sentiment: typeof raw.sentiment === 'string' ? raw.sentiment : 'Neutral',
    importance: typeof raw.importance === 'string' ? raw.importance : 'Medium',
    keyHighlights: Array.isArray(raw.keyHighlights) ? raw.keyHighlights.filter(Boolean) : [],
    managementCommentary: Array.isArray(raw.managementCommentary) ? raw.managementCommentary.filter(Boolean) : [],
    financials: typeof raw.financials === 'object' && raw.financials !== null ? raw.financials : { applicable: false },
    forwardLooking: typeof raw.forwardLooking === 'object' && raw.forwardLooking !== null ? raw.forwardLooking : { applicable: false },
    strategicInitiativesAndPartnerships: typeof raw.strategicInitiativesAndPartnerships === 'object' && raw.strategicInitiativesAndPartnerships !== null ? raw.strategicInitiativesAndPartnerships : { applicable: false },
    riskFactorsAndRedFlags: typeof raw.riskFactorsAndRedFlags === 'object' && raw.riskFactorsAndRedFlags !== null ? raw.riskFactorsAndRedFlags : { applicable: false },
    corporateActions: typeof raw.corporateActions === 'object' && raw.corporateActions !== null ? raw.corporateActions : {},
    categorySpecificDetails: typeof raw.categorySpecificDetails === 'object' && raw.categorySpecificDetails !== null ? raw.categorySpecificDetails : {},
  };
}

/**
 * Cleans and parses JSON string from Gemini response.
 */
function safeParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = rawText.trim();
  // Strip markdown code fences if wrapped in ```json ... ``` or ``` ... ```
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    cleaned = match[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // If strict parse fails, try extracting first outermost { ... }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (nestedErr) {
        return null;
      }
    }
    return null;
  }
}

/**
 * generateAIAnalysis
 *
 * Runs on-demand AI analysis using the 5-Tier Gemini Model Cascade.
 *
 * @param {object} ann - Announcement object (must have .pdfUrl)
 * @param {object} [options] - Optional configurations
 * @returns {Promise<{ _model: string, analysis: object } | null>}
 */
async function generateAIAnalysis(ann, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[aiSummarizer] GEMINI_API_KEY is not set');
    return null;
  }

  const pdfUrl = ann.pdfUrl;
  if (!pdfUrl) {
    console.log(`[aiSummarizer] No PDF URL for announcement ${ann._id || ann.id}`);
    return null;
  }

  const base64Pdf = await downloadPdfAsBase64(pdfUrl);
  if (!base64Pdf) {
    console.error(`[aiSummarizer] Could not obtain base64 PDF payload for ${ann._id || ann.id}`);
    return null;
  }

  const client = getAiClient();
  if (!client) {
    console.warn('[aiSummarizer] Gemini client could not be initialized');
    return null;
  }

  const scriptLabel = ann.scriptName || ann.scriptCode || ann.symbol || ann._id || ann.id || 'Filing';
  const customModels = options.models || MODEL_CASCADE;

  // ── Cascade through Model Hierarchy ──────────────────────────────────────────
  let lastError = null;

  for (const modelName of customModels) {
    try {
      console.log(`[aiSummarizer] Attempting AI analysis with model: "${modelName}" for ${scriptLabel}`);

      const response = await client.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: base64Pdf, mimeType: 'application/pdf' } },
              { text: AI_ANALYST_PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const rawOutput = response.text;
      const parsed = safeParseJson(rawOutput);

      if (!parsed) {
        console.warn(`[aiSummarizer] Model "${modelName}" returned invalid JSON for ${scriptLabel}, cascading to next tier...`);
        continue;
      }

      const normalized = normalizeAnalysisOutput(parsed);
      if (!normalized) {
        console.warn(`[aiSummarizer] Model "${modelName}" returned unnormalizable schema for ${scriptLabel}, cascading...`);
        continue;
      }

      console.log(`[aiSummarizer] ✅ Successfully generated analysis using "${modelName}" for ${scriptLabel}`);
      return {
        _model: modelName,
        analysis: normalized,
      };

    } catch (err) {
      lastError = err;
      const statusCode = err?.status || err?.response?.status;
      const errMsg = err?.message || 'Unknown error';

      console.warn(`[aiSummarizer] Tier "${modelName}" failed for ${scriptLabel} (Status: ${statusCode || 'N/A'} - ${errMsg}). Cascading to next model...`);
    }
  }

  console.error(`[aiSummarizer] All ${customModels.length} cascade models failed for ${scriptLabel}. Last error:`, lastError?.message);
  return null;
}

/**
 * Backward-compatible alias.
 * @deprecated Use generateAIAnalysis instead.
 */
async function generateAnnouncementSummary(ann) {
  const result = await generateAIAnalysis(ann);
  return result ? result.analysis : null;
}

module.exports = {
  MODEL_CASCADE,
  generateAIAnalysis,
  generateAnnouncementSummary,
  safeParseJson,
  normalizeAnalysisOutput,
  downloadPdfAsBase64,
};
