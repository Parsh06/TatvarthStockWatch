const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const { AI_ANALYST_PROMPT } = require('./prompts');

// Initialize Gemini SDK lazily
let ai = null;
const AI_MODEL = 'gemini-3.1-flash-lite';

function getAiClient() {
  if (!ai && process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

/**
 * Downloads a PDF from a URL and returns a base64 string.
 */
async function downloadPdfAsBase64(pdfUrl) {
  try {
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 15000,
    });
    return Buffer.from(response.data).toString('base64');
  } catch (err) {
    console.error(`[aiSummarizer] Failed to download PDF: ${pdfUrl}`, err.message);
    return null;
  }
}

/**
 * generateAIAnalysis
 *
 * On-demand AI analysis for a single announcement.
 * Returns { _model, analysis } on success, or null on failure.
 *
 * @param {object} ann - Announcement object (must have .pdfUrl)
 * @returns {Promise<{ _model: string, analysis: object } | null>}
 */
async function generateAIAnalysis(ann) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[aiSummarizer] GEMINI_API_KEY is not set');
    return null;
  }

  const pdfUrl = ann.pdfUrl;
  if (!pdfUrl) {
    console.log(`[aiSummarizer] No PDF URL for announcement ${ann._id || ann.id}`);
    return null;
  }

  const base64Pdf = await downloadPdfAsBase64(pdfUrl);
  if (!base64Pdf) return null;

  try {
    const client = getAiClient();
    if (!client) {
      console.warn('[aiSummarizer] Gemini client could not be initialized');
      return null;
    }

    const response = await client.models.generateContent({
      model: AI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: base64Pdf, mimeType: 'application/pdf' } },
            { text: AI_ANALYST_PROMPT },
          ],
        },
      ],
      config: { responseMimeType: 'application/json' },
    });

    const output = response.text;

    // Parse JSON safely — Gemini sometimes wraps in markdown blocks even with responseMimeType
    let jsonStr = output.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) jsonStr = match[1].trim();

    try {
      const analysisObj = JSON.parse(jsonStr);
      return { _model: AI_MODEL, analysis: analysisObj };
    } catch (parseErr) {
      console.error(`[aiSummarizer] Failed to parse JSON for ${ann._id || ann.id}. Raw:\n${output}`);
      return null;
    }

  } catch (err) {
    console.error(`[aiSummarizer] Gemini API error for ${ann._id || ann.id}:`, err?.response?.data || err.message);
    return null;
  }
}

/**
 * Backward-compatible alias.
 * @deprecated Use generateAIAnalysis instead.
 */
async function generateAnnouncementSummary(ann) {
  const result = await generateAIAnalysis(ann);
  return result ? result.analysis : null;
}

module.exports = { generateAIAnalysis, generateAnnouncementSummary };


