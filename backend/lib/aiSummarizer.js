'use strict';

const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const { AI_ANALYST_PROMPT } = require('./prompts');

// ── Active Gemini Model Cascade ──────────────────────────────────────────────
const MODEL_CASCADE = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
];

// Lazily initialized Gemini SDK client
let _aiClient = null;

function getAiClient() {
  if (!_aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (apiKey) {
      try {
        _aiClient = new GoogleGenAI({ apiKey });
      } catch (e) {
        console.warn('[aiSummarizer] GoogleGenAI init fallback to REST:', e.message);
      }
    }
  }
  return _aiClient;
}

/**
 * Downloads a filing PDF from a URL and returns a base64 encoded string.
 */
async function downloadPdfAsBase64(pdfUrl) {
  if (!pdfUrl) return null;
  try {
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream,*/*',
        'Referer': 'https://www.bseindia.com/',
        'Origin': 'https://www.bseindia.com',
      },
      timeout: 10000,
    });
    // Cap at 2.5MB to stay well within free tier token quotas and prevent timeouts
    if (response.data.length <= 2.5 * 1024 * 1024) {
      return Buffer.from(response.data).toString('base64');
    }
    console.log(`[aiSummarizer] PDF is ${(response.data.length / (1024*1024)).toFixed(1)}MB (>2.5MB), using text prompt mode.`);
    return null;
  } catch (err) {
    console.error(`[aiSummarizer] Failed to download PDF (${pdfUrl}):`, err.message);
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
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    cleaned = match[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
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
 * Runs on-demand AI analysis using the Active Gemini Model Cascade with REST fallback.
 *
 * @param {object} ann - Announcement object
 * @param {object} [options] - Optional configurations
 * @returns {Promise<{ _model: string, analysis: object } | null>}
 */
async function generateAIAnalysis(ann, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[aiSummarizer] GEMINI_API_KEY is not set');
    return null;
  }

  const scriptLabel = ann.scriptName || ann.scriptCode || ann.symbol || ann._id || ann.id || 'Filing';
  const customModels = options.models || MODEL_CASCADE;

  const pdfUrl = ann.pdfUrl;
  let base64Pdf = null;
  if (pdfUrl) {
    base64Pdf = await downloadPdfAsBase64(pdfUrl);
  }

  const textPrompt = `${AI_ANALYST_PROMPT}\n\nFiling Details:\nCompany: ${ann.scriptName || ann.scriptCode || ann.companyName || ''}\nExchange: ${ann.exchange || 'BSE/NSE'}\nCategory: ${ann.category || ''}\nSub-Category: ${ann.subCategory || ''}\nHeadline/Subject: ${ann.subject || ann.headline || ''}\nDescription: ${ann.description || ''}\nDate: ${ann.datetimeIST || ann.date || ''}\nPDF URL: ${ann.pdfUrl || 'N/A'}\n\nAnalyze this corporate filing exhaustively based on the details above.`;

  let lastError = null;

  for (const modelName of customModels) {
    try {
      console.log(`[aiSummarizer] Attempting AI analysis with model: "${modelName}" for ${scriptLabel} (hasPdf=${Boolean(base64Pdf)})`);

      const parts = [];
      if (base64Pdf) {
        parts.push({ inline_data: { mime_type: 'application/pdf', data: base64Pdf } });
        parts.push({ text: AI_ANALYST_PROMPT });
      } else {
        parts.push({ text: textPrompt });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await axios.post(url, {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      }, { timeout: 8000 });

      const rawOutput = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
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
      const statusCode = err?.response?.status || err?.status;
      const errMsg = err?.response?.data?.error?.message || err?.message || 'Unknown error';

      console.warn(`[aiSummarizer] Tier "${modelName}" failed for ${scriptLabel} (Status: ${statusCode || 'N/A'} - ${errMsg}). Cascading...`);
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
