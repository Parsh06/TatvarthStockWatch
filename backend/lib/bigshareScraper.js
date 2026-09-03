'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenAI } = require('@google/genai');

const BIGSHARE_BASE_URLS = [
  'https://ipo.bigshareonline.com',
  'https://ipo1.bigshareonline.com',
  'https://ipo2.bigshareonline.com',
];

const BIGSHARE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'https://ipo.bigshareonline.com',
  'Referer': 'https://ipo.bigshareonline.com/ipo_status.html',
};

let _bigshareSymbolCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = parseInt(process.env.IPO_SYMBOL_CACHE_TTL_MS || '300000', 10); // 5 min default

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
 * Fetch active IPO symbols list from BigShare Online
 */
async function scrapeBigshareCompanies(options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();

  if (!forceRefresh && _bigshareSymbolCache.data && (now - _bigshareSymbolCache.fetchedAt) < CACHE_TTL_MS) {
    return _bigshareSymbolCache.data;
  }

  let lastErr;
  for (const baseUrl of BIGSHARE_BASE_URLS) {
    try {
      const res = await axios.get(`${baseUrl}/ipo_status.html`, {
        headers: {
          'User-Agent': BIGSHARE_HEADERS['User-Agent'],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 12000,
      });

      const $ = cheerio.load(res.data);
      const companies = [];
      $('#ddlCompany option').each((i, el) => {
        const val = $(el).attr('value');
        const text = $(el).text().trim();
        if (val && val !== '--Select Company--' && val !== '0' && text && !text.startsWith('--')) {
          companies.push({
            clientId: String(val).trim(),
            symbol: text,
            registrar: 'BIGSHARE',
          });
        }
      });

      if (companies.length > 0) {
        _bigshareSymbolCache = { data: companies, fetchedAt: now };
        return companies;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (_bigshareSymbolCache.data) {
    return _bigshareSymbolCache.data;
  }
  throw lastErr || new Error('Failed to scrape BigShare company list');
}

const { createWorker } = require('tesseract.js');

let _tessWorker = null;
async function getTessWorker() {
  if (!_tessWorker) {
    _tessWorker = await createWorker('eng');
    await _tessWorker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: '7',
    });
  }
  return _tessWorker;
}

const GEMINI_VISION_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.5-flash-lite',
];

/**
 * Solve BigShare 6-digit image captcha automatically
 * Priority 1: Fast local Tesseract OCR (<40ms, zero quota)
 * Priority 2: Multi-Model Gemini Vision Pool (fallback if OCR has heavy noise lines)
 */
async function solveBigshareCaptcha(imageBase64) {
  const cleanB64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(cleanB64, 'base64');

  // 1. Try local Tesseract OCR first (runs locally on CPU, 0 API quota)
  try {
    const worker = await getTessWorker();
    const ocrRes = await worker.recognize(buf);
    const digits = (ocrRes.data?.text || '').replace(/[^0-9]/g, '');
    if (digits.length === 6) {
      return digits;
    }
  } catch (tessErr) {
    // continue to vision fallback
  }

  // 2. Fallback to Multi-Model Gemini Vision Pool
  const ai = getAiClient();
  if (ai) {
    for (const model of GEMINI_VISION_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Read the 6 digits in this captcha image. Output ONLY the 6 digits and nothing else (e.g. 123456).' },
                { inlineData: { mimeType: 'image/png', data: cleanB64 } },
              ],
            },
          ],
        });

        const digits = (response.text || '').trim().replace(/[^0-9]/g, '');
        if (digits.length === 6) {
          return digits;
        }
      } catch (err) {
        // If 429 quota reached on this model, loop to next model in pool
        continue;
      }
    }
  }

  throw new Error('Failed to solve BigShare captcha via Hybrid OCR Engine');
}

/**
 * Fetch a fresh Captcha token & image from BigShare
 */
async function getBigshareCaptcha(targetBaseUrl) {
  const urlList = targetBaseUrl ? [targetBaseUrl] : BIGSHARE_BASE_URLS;
  let lastErr;
  for (const baseUrl of urlList) {
    try {
      const res = await axios.get(`${baseUrl}/Captcha.ashx`, {
        headers: {
          ...BIGSHARE_HEADERS,
          Origin: baseUrl,
          Referer: `${baseUrl}/ipo_status.html`,
        },
        timeout: 10000,
      });

      const token = res.data?.token || res.data?.Token;
      const image = res.data?.image || res.data?.Image;

      if (token && image) {
        return { token, image, baseUrl };
      }
    } catch (err) {
      lastErr = err;
      const retrySec = parseInt(err.response?.headers?.['retry-after'] || err.response?.data?.Retry || 0, 10);
      if (retrySec > 0 && retrySec <= 5) {
        await new Promise(r => setTimeout(r, retrySec * 1000));
      }
    }
  }
  throw lastErr || new Error('Invalid Captcha response from BigShare across all mirror servers');
}

let _serverRoundRobin = 0;

/**
 * Query IPO allotment status on BigShare for a given Company ID & PAN
 */
async function queryBigshare(clientId, pan, retries = 3) {
  const cleanPan = String(pan).trim().toUpperCase();
  const cleanClientId = String(clientId).trim();

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (let s = 0; s < BIGSHARE_BASE_URLS.length; s++) {
      const baseUrl = BIGSHARE_BASE_URLS[(_serverRoundRobin + s) % BIGSHARE_BASE_URLS.length];
      try {
        // 1. Fetch fresh captcha challenge from selected server
        const { token, image } = await getBigshareCaptcha(baseUrl);

        // 2. Solve captcha via Hybrid OCR Engine
        const solvedDigits = await solveBigshareCaptcha(image);

        // 3. Post verification payload
        const payload = {
          Applicationno: '',
          Company: cleanClientId,
          SelectionType: 'PN',
          PanNo: cleanPan,
          txtcsdl: '',
          txtDPID: '',
          txtClId: '',
          ddlType: '0',
          lang: 'en',
          CaptchaToken: token,
          CaptchaAnswer: solvedDigits,
          ResultToken: '',
        };

        const res = await axios.post(`${baseUrl}/Data.aspx/FetchIpodetails`, payload, {
          headers: {
            ...BIGSHARE_HEADERS,
            Origin: baseUrl,
            Referer: `${baseUrl}/ipo_status.html`,
          },
          timeout: 15000,
        });

        const data = res.data?.d;
        if (data) {
          // If captcha failed (rare misread), continue attempt
          if (data.Status === 'CAPTCHA') {
            await new Promise(r => setTimeout(r, 400));
            continue;
          }
          // Advance pool pointer
          _serverRoundRobin = (_serverRoundRobin + 1) % BIGSHARE_BASE_URLS.length;
          return data;
        }
      } catch (err) {
        lastErr = err;
        const retrySec = parseInt(err.response?.headers?.['retry-after'] || err.response?.data?.Retry || 0, 10);
        const waitMs = (retrySec > 0 && retrySec <= 5) ? retrySec * 1000 : 500;
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  throw lastErr || new Error('Failed to query BigShare allotment after retries across all mirror servers');
}

module.exports = {
  scrapeBigshareCompanies,
  solveBigshareCaptcha,
  getBigshareCaptcha,
  queryBigshare,
};
