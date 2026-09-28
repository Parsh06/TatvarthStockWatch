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
 * Ensures the prompt fits within Groq's 8,000 token limit (free tier).
 * If the prompt is excessively large (>20,000 characters), it condenses
 * boilerplate sections of AI_ANALYST_PROMPT while strictly preserving:
 * - 100% of the role & persona
 * - 100% of the rules & calculations (QoQ, YoY, Units, Notes)
 * - 100% of the exact JSON schema
 * - 100% of the extracted PDF text and metadata
 */
function budgetPromptForGroq(prompt) {
  if (!prompt || typeof prompt !== 'string' || prompt.length <= 18000) {
    return prompt;
  }

  const splitIdx = prompt.indexOf('# FILING METADATA & DETAILS');
  if (splitIdx === -1) return prompt;

  const filingData = prompt.substring(splitIdx);

  const compactInstructions = `You are Tatvarth AI, a senior institutional equity research analyst specializing in Indian listed companies (BSE/NSE filings).
Extract everything an institutional investor needs: hard numbers, comparative growth (QoQ and YoY), forward guidance, strategic direction, and risks.
Be completely factual. Extract only from the provided text and filing details. Never hallucinate, estimate, or invent numbers.
If data is unavailable but structurally relevant to this category -> "Not Reported".
If data is not relevant to this category -> "Not Applicable".
Units: Carefully check the unit in the financial results table header (e.g. ₹ in Lakhs vs ₹ in Crores). If the table is in Lakhs, provide the numbers clearly, e.g. "₹43.11 Cr (4,311.11 Lakhs)".
Always extract or calculate YoY% and QoQ% if prior periods are available.
Always scan "Notes to Financial Results / Explanatory Notes" for corporate actions (IPO, bonus, splits, dividends, capex, legal).

# RESPONSE FORMAT
Return ONLY valid JSON. No markdown. No explanations. No comments. No code block. No extra text.

{
  "announcementCategory": "Financial Results | Outcome of Board Meeting | AGM/EGM | Press Release | Company Update | Investor Presentation | Others",
  "announcementType": "Standalone | Consolidated | Procedural | Guidance",
  "headline": "Crisp institutional headline highlighting key numbers/decisions (max 20 words)",
  "summary": [
    "3 to 5 concise bullet points highlighting revenue, profits, growth rates, or key decisions",
    "Include exact figures and YoY/QoQ percentages"
  ],
  "financials": {
    "applicable": true,
    "period": "e.g. Q1 FY27 (Quarter ended June 30, 2026)",
    "revenue": { "current": "", "previousQuarter": "", "previousYear": "", "qoqPercent": "", "yoyPercent": "" },
    "grossProfit": { "current": "", "previousQuarter": "", "previousYear": "", "qoqPercent": "", "yoyPercent": "" },
    "ebitda": { "current": "", "previousQuarter": "", "previousYear": "", "qoqPercent": "", "yoyPercent": "", "margin": "" },
    "operatingProfit": { "current": "", "previousQuarter": "", "previousYear": "", "qoqPercent": "", "yoyPercent": "" },
    "netProfit": { "current": "", "previousQuarter": "", "previousYear": "", "qoqPercent": "", "yoyPercent": "" },
    "eps": { "current": "", "previousQuarter": "", "previousYear": "", "qoqPercent": "", "yoyPercent": "" },
    "marginAnalysis": { "grossMargin": "", "operatingMargin": "", "ebitdaMargin": "", "netMargin": "" },
    "balanceSheetSnapshot": { "totalDebt": "", "netDebt": "", "cashAndEquivalents": "", "netWorth": "", "debtToEquity": "" },
    "cashFlowHighlights": { "operatingCashFlow": "", "capex": "", "freeCashFlow": "" },
    "exceptionalItems": ""
  },
  "forwardLooking": {
    "applicable": true,
    "guidance": "",
    "capacityExpansionPlans": "",
    "capexPlans": "",
    "newProductOrServicePlans": "",
    "newMarketOrGeographyPlans": "",
    "orderBookOrPipeline": "",
    "mAndAOrInorganicIntent": "",
    "technologyOrDigitalInvestmentPlans": "",
    "mediumTermStrategicTargets": ""
  },
  "strategicInitiativesAndPartnerships": {
    "applicable": true,
    "newPartnershipsOrJVsOrMOUs": "",
    "subsidiariesOrStakeChanges": "",
    "technologyOrLicensingTieUps": "",
    "governmentSchemeParticipation": "",
    "esgOrSustainabilityInitiatives": ""
  },
  "managementCommentary": [
    "Paraphrased quote or commentary from named executive (CEO/MD/Chairman/CFO)"
  ],
  "riskFactorsAndRedFlags": {
    "applicable": true,
    "auditorQualificationOrGoingConcern": "",
    "materialRelatedPartyTransactions": "",
    "litigationOrRegulatoryNotices": "",
    "creditRatingConcerns": "",
    "guidanceMissOrDelay": "",
    "keyManagementDepartureWithoutSuccession": ""
  },
  "corporateActions": {
    "dividend": "",
    "stockSplit": "",
    "bonusIssue": "",
    "buyback": "",
    "rightsIssue": "",
    "ipo": "",
    "merger": "",
    "acquisition": "",
    "fundRaise": "",
    "boardChanges": "",
    "managementChanges": "",
    "creditRatingChange": "",
    "litigationOrRegulatory": ""
  },
  "categorySpecificDetails": {
    "meetingResolutions": "",
    "votingResults": "",
    "noticeDetails": "",
    "complianceStatus": "",
    "pressReleaseHighlights": ""
  },
  "keyHighlights": [
    "Up to 8 high-impact bullet points with hard facts, YoY/QoQ comparisons, and strategic highlights"
  ],
  "sentiment": "Positive | Neutral | Negative",
  "importance": "High | Medium | Low"
}

---
`;

  return `${compactInstructions}\n${filingData}`;
}

/**
 * Runs the Groq model cascade.
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

  const groqPrompt = budgetPromptForGroq(prompt);
  const models = options.models || GROQ_MODELS;
  const timeout = options.timeout || 12000;
  let allRateLimited = true;

  for (let i = 0; i < models.length; i++) {
    const modelName = models[i];
    console.log('[GroqProvider] Trying model "' + modelName + '" (tier ' + (i + 1) + '/' + models.length + ')');

    const result = await callGroqModel(apiKey, modelName, groqPrompt, timeout);

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
