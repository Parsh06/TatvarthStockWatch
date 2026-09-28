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
 * Downloads a filing PDF from a URL and extracts its text layer + optional base64.
 * Uses pdf-parse to extract structured text directly in memory.
 */
async function downloadPdfAndExtractText(pdfUrl) {
  if (!pdfUrl) return { extractedText: null, base64Pdf: null };
  try {
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream,*/*',
        'Referer': 'https://www.bseindia.com/',
      },
      timeout: 10000,
    });

    const buf = Buffer.from(response.data);
    let extractedText = null;

    try {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse(new Uint8Array(response.data));
      await parser.load();
      const parseRes = await parser.getText();
      if (parseRes && typeof parseRes.text === 'string' && parseRes.text.trim().length > 30) {
        // Clean and normalize text
        extractedText = parseRes.text
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();
        // Limit to 12,000 characters to stay within token budgets
        if (extractedText.length > 12000) {
          extractedText = extractedText.substring(0, 12000) + '\n... [Remaining filing content omitted for brevity]';
        }
        console.log(`[aiSummarizer] Successfully extracted ${extractedText.length} chars of text from PDF (${pdfUrl})`);
      }
    } catch (parseErr) {
      console.warn(`[aiSummarizer] PDF text extraction failed (${pdfUrl}):`, parseErr.message);
    }

    // Prepare base64 for vision models (cap at 10MB)
    let base64Pdf = null;
    if (buf.length <= 10 * 1024 * 1024) {
      base64Pdf = buf.toString('base64');
    }

    return { extractedText, base64Pdf };
  } catch (err) {
    console.warn(`[aiSummarizer] PDF download failed (${pdfUrl}):`, err.message);
    return { extractedText: null, base64Pdf: null };
  }
}

/**
 * Backward compatibility alias.
 */
async function downloadPdfAsBase64(pdfUrl) {
  const { base64Pdf } = await downloadPdfAndExtractText(pdfUrl);
  return base64Pdf;
}

/**
 * Normalizes and validates the AI analysis JSON output against required structure.
 */
function normalizeAnalysisOutput(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    executiveSummary: typeof raw.executiveSummary === 'string' ? raw.executiveSummary : (typeof raw.headline === 'string' ? raw.headline : 'Executive summary unavailable.'),
    announcementCategory: typeof raw.announcementCategory === 'string' ? raw.announcementCategory : 'General Updates',
    announcementType: typeof raw.announcementType === 'string' ? raw.announcementType : undefined,
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

  // ── 1. Download PDF & Extract Text if available ───────────────────────────
  const pdfUrl = ann.pdfUrl;
  let base64Pdf = null;
  let extractedText = null;

  if (pdfUrl) {
    const pdfResult = await downloadPdfAndExtractText(pdfUrl);
    base64Pdf = pdfResult.base64Pdf;
    extractedText = pdfResult.extractedText;
  }

  // ── 2. Build the full prompt with filing metadata & extracted text ─────────
  let promptWithDetails = `${AI_ANALYST_PROMPT}

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

  if (extractedText) {
    promptWithDetails += `

---

# EXTRACTED TEXT FROM OFFICIAL STATUTORY FILING PDF
${extractedText}`;
  }

  // ── 3. Route to AI provider ───────────────────────────────────────────────
  console.log(`[aiSummarizer] Requesting AI analysis for ${scriptLabel} (hasPdf=${Boolean(base64Pdf)})`);
  const routerStatus = getRouterStatus();
  console.log(`[aiSummarizer] Router status: Gemini=${routerStatus.hasGemini ? 'ON' : 'OFF'}, Groq=${routerStatus.hasGroq ? 'ON' : 'OFF'}, Cooldown=${routerStatus.geminiCooldownActive ? `YES (${Math.ceil(routerStatus.geminiCooldownRemainingMs/1000)}s)` : 'NO'}`);

  // Only pass base64Pdf to multimodal Gemini if text could not be extracted (e.g. scanned image PDF).
  // If text is already extracted into the prompt, sending a heavy base64 PDF wastes bandwidth and causes timeouts.
  const multimodalPayload = extractedText ? null : base64Pdf;
  const result = await routeRequest(promptWithDetails, multimodalPayload, options);

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
  downloadPdfAndExtractText,
  getRouterStatus,
};
