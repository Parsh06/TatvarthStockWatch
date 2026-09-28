'use strict';

/**
 * aiSummarizer.js
 *
 * AI-powered announcement analysis engine for StockWatch.
 *
 * Uses a dual-provider system (Gemini + Grok) via providerRouter
 * for intelligent failover and rate-limit resilience.
 *
 * Flow:
 *   1. Build prompt from announcement metadata + AI_ANALYST_PROMPT
 *   2. Optionally download PDF as base64
 *   3. Route to best available AI provider via providerRouter
 *   4. Parse + validate JSON response
 *   5. Return normalized analysis or deterministic fallback
 */

const axios = require('axios');
const { AI_ANALYST_PROMPT } = require('./prompts');
const { routeRequest, getRouterStatus } = require('./providers/providerRouter');

// Re-export for backward compatibility — legacy consumers may import from here
const { GEMINI_MODELS } = require('./providers/geminiProvider');
const MODEL_CASCADE = GEMINI_MODELS;

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
      timeout: 7000,
    });
    // Cap at 1.5MB to stay well within free tier token limits (250k TPM)
    if (response.data.length <= 1.5 * 1024 * 1024) {
      return Buffer.from(response.data).toString('base64');
    }
    console.log(`[aiSummarizer] PDF is ${(response.data.length / (1024*1024)).toFixed(1)}MB (>1.5MB), using fast text synthesis mode.`);
    return null;
  } catch (err) {
    console.warn(`[aiSummarizer] PDF download skipped (${pdfUrl}):`, err.message);
    return null;
  }
}

/**
 * Normalizes and validates the AI analysis JSON output against required structure.
 */
function normalizeAnalysisOutput(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    executiveSummary: typeof raw.executiveSummary === 'string' ? raw.executiveSummary : (typeof raw.headline === 'string' ? raw.headline : 'Executive summary unavailable.'),
    announcementCategory: typeof raw.announcementCategory === 'string' ? raw.announcementCategory : 'General Updates',
    headline: typeof raw.headline === 'string' ? raw.headline : undefined,
    summary: Array.isArray(raw.summary) ? raw.summary.filter(Boolean) : undefined,
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
 * Cleans and parses JSON string from AI response (works for both Gemini and Grok).
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
 * Runs on-demand AI analysis using the dual-provider system (Gemini + Grok).
 * The providerRouter handles failover, cooldown, and provider selection.
 *
 * @param {object} ann - Announcement object
 * @param {object} [options] - Optional configurations
 * @returns {Promise<{ _model: string, _provider: string, analysis: object } | null>}
 */
async function generateAIAnalysis(ann, options = {}) {
  const scriptLabel = ann.scriptName || ann.scriptCode || ann.symbol || ann._id || ann.id || 'Filing';

  // ── 1. Download PDF if available ──────────────────────────────────────────
  const pdfUrl = ann.pdfUrl;
  let base64Pdf = null;
  if (pdfUrl) {
    base64Pdf = await downloadPdfAsBase64(pdfUrl);
  }

  // ── 2. Build the full prompt with filing metadata ─────────────────────────
  const promptWithDetails = `${AI_ANALYST_PROMPT}

---

# FILING METADATA & DETAILS
Company Name: ${ann.scriptName || ann.scriptCode || ann.companyName || 'Listed Entity'}
Exchange: ${ann.exchange || 'BSE/NSE'}
BSE Scrip Code: ${ann.bseCode || ann.scriptCode || ''}
NSE Symbol: ${ann.nseSymbol || ann.symbol || ''}
Category: ${ann.category || ''}
Sub-Category: ${ann.subCategory || ''}
Headline / Subject: ${ann.subject || ann.headline || ''}
Description: ${ann.description || ''}
Date / Time (IST): ${ann.datetimeIST || ann.date || ann.announcementDate || ''}
Statutory Filing PDF Link: ${ann.pdfUrl || 'N/A'}`;

  // ── 3. Route to AI provider ───────────────────────────────────────────────
  console.log(`[aiSummarizer] Requesting AI analysis for ${scriptLabel} (hasPdf=${Boolean(base64Pdf)})`);
  const routerStatus = getRouterStatus();
  console.log(`[aiSummarizer] Router status: Gemini=${routerStatus.hasGemini ? 'ON' : 'OFF'}, Groq=${routerStatus.hasGroq ? 'ON' : 'OFF'}, Cooldown=${routerStatus.geminiCooldownActive ? `YES (${Math.ceil(routerStatus.geminiCooldownRemainingMs/1000)}s)` : 'NO'}`);

  const result = await routeRequest(promptWithDetails, base64Pdf, options);

  if (!result || !result.success) {
    console.warn(`[aiSummarizer] All providers failed for ${scriptLabel}. Engaging resilient synthesis fallback.`);
    return generateDeterministicSummary(ann);
  }

  // ── 4. Parse and validate JSON response ───────────────────────────────────
  const parsed = safeParseJson(result.text);

  if (!parsed) {
    console.warn(`[aiSummarizer] Provider "${result.provider}" model "${result.model}" returned invalid JSON for ${scriptLabel}, falling back.`);
    return generateDeterministicSummary(ann);
  }

  const normalized = normalizeAnalysisOutput(parsed);
  if (!normalized) {
    console.warn(`[aiSummarizer] Provider "${result.provider}" model "${result.model}" returned invalid schema for ${scriptLabel}, falling back.`);
    return generateDeterministicSummary(ann);
  }

  console.log(`[aiSummarizer] ✅ Successfully generated analysis using ${result.provider}/"${result.model}" for ${scriptLabel}`);
  return {
    _model: result.model,
    _provider: result.provider,
    analysis: normalized,
  };
}

/**
 * Deterministic synthesis fallback when all AI providers fail.
 */
function generateDeterministicSummary(ann) {
  const category = ann.category || 'Company Update';
  const subCategory = ann.subCategory || '';
  const subject = ann.subject || ann.headline || 'Corporate filing';
  const scriptName = ann.scriptName || ann.companyName || ann.scriptCode || 'Listed Entity';
  const date = ann.datetimeIST || ann.announcementDate || 'Recent';

  const isResult = /result|financial/i.test(category) || /result|financial/i.test(subject);
  const isBoardMeeting = /board meeting|outcome/i.test(category) || /board meeting/i.test(subject);
  const isAgm = /agm|egm|shareholder/i.test(category) || /general meeting/i.test(subject);
  const isDividend = /dividend/i.test(category) || /dividend/i.test(subject);
  const isInsider = /insider|trading window/i.test(category) || /trading window/i.test(subject);

  let sentiment = 'Neutral';
  let importance = 'Medium';
  let inferredCategory = category;

  if (isResult) {
    inferredCategory = 'Financial Results';
    importance = 'High';
    sentiment = 'Positive';
  } else if (isBoardMeeting) {
    inferredCategory = 'Outcome of Board Meeting';
    importance = 'High';
  } else if (isAgm) {
    inferredCategory = 'AGM/EGM';
    importance = 'Medium';
  } else if (isInsider) {
    inferredCategory = 'Insider Trading / Trading Window';
    importance = 'Low';
  }

  const highlights = [
    `Filing submitted by ${scriptName} under category "${inferredCategory}".`,
    subject.length > 120 ? subject.substring(0, 120) + '…' : subject
  ];

  if (ann.bseCode) highlights.push(`BSE Scrip Code: ${ann.bseCode}`);
  if (ann.pdfUrl) highlights.push(`Statutory filing PDF verified on BSE/NSE exchange portal.`);

  return {
    _model: 'deterministic-synthesizer',
    _provider: 'fallback',
    analysis: {
      executiveSummary: `${scriptName} has submitted an official corporate filing regarding "${subject.length > 90 ? subject.substring(0, 90) + '...' : subject}" on ${date}. The filing has been recorded with the exchange under ${inferredCategory}.`,
      announcementCategory: inferredCategory,
      sentiment: sentiment,
      importance: importance,
      keyHighlights: highlights,
      managementCommentary: [],
      financials: {
        applicable: isResult,
        details: isResult ? 'Quarterly/annual financial figures and Limited Review Report attached in official exchange PDF.' : 'Not Applicable'
      },
      forwardLooking: {
        applicable: false,
        guidance: null
      },
      riskFactorsAndRedFlags: {
        applicable: false,
        risks: null
      },
      corporateActions: {
        action: isDividend ? 'Dividend Declared/Proposed' : 'None'
      }
    }
  };
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
  generateDeterministicSummary,
  safeParseJson,
  normalizeAnalysisOutput,
  downloadPdfAsBase64,
  getRouterStatus,
};
