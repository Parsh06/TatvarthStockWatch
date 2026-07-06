const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const { AI_ANALYST_PROMPT } = require('./prompts');

// Initialize Gemini SDK later when needed
let ai = null;
function getAiClient() {
  if (!ai && process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

/**
 * Downloads a PDF from a URL and converts it to a base64 string
 */
async function downloadPdfAsBase64(pdfUrl) {
  try {
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      timeout: 10000 // 10 second timeout
    });
    return Buffer.from(response.data).toString('base64');
  } catch (err) {
    console.error(`[aiSummarizer] Failed to download PDF: ${pdfUrl}`, err.message);
    return null;
  }
}

/**
 * Generates an AI summary for a single announcement
 * Returns the parsed JSON object or null if failed
 */
async function generateAnnouncementSummary(ann) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[aiSummarizer] GEMINI_API_KEY is not set');
    return null;
  }

  const pdfUrl = ann.pdfUrl;
  if (!pdfUrl) {
    console.log(`[aiSummarizer] No PDF URL for announcement ${ann.id}`);
    return null;
  }

  const base64Pdf = await downloadPdfAsBase64(pdfUrl);
  if (!base64Pdf) {
    return null;
  }

  try {
    const client = getAiClient();
    if (!client) {
      console.warn('[aiSummarizer] Gemini Client could not be initialized');
      return null;
    }
    
    // We use gemini-1.5-flash as it has a high free tier limit (1500 per day, 15 RPM)
    // gemini-2.5-flash currently has a strict 20/day limit on the free tier
    const response = await client.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Pdf,
                mimeType: 'application/pdf'
              }
            },
            {
              text: AI_ANALYST_PROMPT
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const output = response.text;
    
    // Parse the JSON safely (Gemini sometimes wraps in markdown code blocks even with responseMimeType)
    let jsonStr = output.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      jsonStr = match[1].trim();
    }

    try {
      const resultObj = JSON.parse(jsonStr);
      return resultObj;
    } catch (parseErr) {
      console.error(`[aiSummarizer] Failed to parse JSON for ${ann.id}. Output was:\n${output}`);
      return null;
    }

  } catch (err) {
    console.error(`[aiSummarizer] Gemini API error for ${ann.id}:`, err?.response?.data || err.message);
    return null;
  }
}

module.exports = {
  generateAnnouncementSummary
};
