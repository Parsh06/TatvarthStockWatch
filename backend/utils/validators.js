'use strict';

/**
 * validators.js
 *
 * Strict Server-Side Input Validators & SSRF Protection
 */

const { URL } = require('url');

// ── Regex Patterns ────────────────────────────────────────────────────────────
const BSE_CODE_REGEX = /^[0-9]{5,7}$/;
const SCRIP_CODE_REGEX = /^[0-9]{5,7}$/;
const NSE_SYMBOL_REGEX = /^[A-Za-z0-9&_.-]{1,25}$/;
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const SLUG_REGEX = /^[a-z0-9-]{3,60}$/;
const SAFE_TEXT_REGEX = /^[a-zA-Z0-9\s.,&()_/'"#-]+$/;

// ── SSRF Allowed Exchange Hostnames ──────────────────────────────────────────
const ALLOWED_FILING_DOMAINS = [
  'bseindia.com',
  'api.bseindia.com',
  'www.bseindia.com',
  'corporate.bseindia.com',
  'nseindia.com',
  'www.nseindia.com',
  'nsearchives.nseindia.com',
  'archives.nseindia.com',
];

/**
 * Validates a filing PDF URL to prevent Server-Side Request Forgery (SSRF)
 * Rejects private IPs, AWS/GCP metadata services, and unapproved hostnames.
 */
function validateSafeFilingUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'Filing URL must be a non-empty string' };
  }

  try {
    const parsed = new URL(urlString.trim());

    // Protocol must strictly be HTTPS
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only secure HTTPS filing URLs are permitted' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, IP literals, and cloud metadata services
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname === '169.254.169.254' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return { valid: false, error: 'Localhost and private IP addresses are prohibited (SSRF guard)' };
    }

    // Must match official BSE or NSE filing domains
    const isAllowedDomain = ALLOWED_FILING_DOMAINS.some(
      domain => hostname === domain || hostname.endsWith('.' + domain)
    );

    if (!isAllowedDomain) {
      return { valid: false, error: `Domain "${hostname}" is not an authorized exchange disclosure repository` };
    }

    return { valid: true, cleanUrl: parsed.href };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validates script input for watchlist
 */
function validateScripInput(data = {}) {
  const ltdCode = String(data.ltdCode || data.bseCode || data.scripCode || '').trim();
  const symbol = String(data.symbol || data.nseSymbol || '').trim().toUpperCase();
  const scriptName = String(data.scriptName || data.name || ltdCode || symbol || '').trim();
  const exchange = String(data.exchange || 'BOTH').trim().toUpperCase();
  const notes = String(data.notes || '').trim();
  const group = String(data.group || '').trim();
  const isin = String(data.isin || '').trim().toUpperCase();

  if (!ltdCode && !symbol) {
    return { valid: false, error: 'At least one of BSE Code or NSE Symbol is required' };
  }

  if (ltdCode && !SCRIP_CODE_REGEX.test(ltdCode)) {
    return { valid: false, error: 'Invalid BSE Scrip Code format' };
  }

  if (symbol && !NSE_SYMBOL_REGEX.test(symbol)) {
    return { valid: false, error: 'Invalid NSE Symbol format' };
  }

  if (isin && !ISIN_REGEX.test(isin)) {
    return { valid: false, error: 'Invalid ISIN code format (e.g. INE002A01018)' };
  }

  if (!['BSE', 'NSE', 'BOTH'].includes(exchange)) {
    return { valid: false, error: 'Exchange must be BSE, NSE, or BOTH' };
  }

  return {
    valid: true,
    data: {
      ltdCode: ltdCode.slice(0, 30),
      bseCode: ltdCode.slice(0, 30),
      symbol: symbol.slice(0, 30),
      scriptName: scriptName.slice(0, 120),
      exchange,
      notes: notes.slice(0, 500),
      group: group.slice(0, 50),
      isin: isin.slice(0, 12),
    },
  };
}

/**
 * Validates Public Basket Creation input
 */
function validateBasketInput(data = {}) {
  const title = String(data.title || '').trim();
  const description = String(data.description || '').trim();
  const category = String(data.category || 'Curated').trim();
  const rawScripts = Array.isArray(data.scripts) ? data.scripts : [];
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const userSlug = String(data.slug || '').trim().toLowerCase();

  if (title.length < 3 || title.length > 70) {
    return { valid: false, error: 'Basket title must be between 3 and 70 characters' };
  }

  if (description.length > 350) {
    return { valid: false, error: 'Basket description cannot exceed 350 characters' };
  }

  if (rawScripts.length === 0 || rawScripts.length > 50) {
    return { valid: false, error: 'A basket must contain between 1 and 50 stocks' };
  }

  // Deep validate stocks inside basket
  const validatedScripts = [];
  for (const s of rawScripts) {
    if (!s || typeof s !== 'object') continue;
    const bCode = String(s.bseCode || s.ltdCode || s.scripCode || '').trim();
    const sym = String(s.symbol || s.nseSymbol || '').trim().toUpperCase();
    if (!bCode && !sym) continue;
    if (bCode && !SCRIP_CODE_REGEX.test(bCode)) continue;
    if (sym && !NSE_SYMBOL_REGEX.test(sym)) continue;
    validatedScripts.push({
      bseCode: bCode,
      symbol: sym,
      scriptName: String(s.scriptName || s.name || sym || bCode).trim().slice(0, 100),
      exchange: ['BSE', 'NSE', 'BOTH'].includes(String(s.exchange).toUpperCase()) ? String(s.exchange).toUpperCase() : 'BOTH',
      notes: String(s.notes || '').trim().slice(0, 200),
    });
  }

  if (validatedScripts.length === 0) {
    return { valid: false, error: 'A basket must contain at least 1 valid stock with valid BSE code or NSE symbol' };
  }

  if (userSlug && !SLUG_REGEX.test(userSlug)) {
    return { valid: false, error: 'Basket slug must contain only lowercase letters, numbers, and hyphens (3-60 chars)' };
  }

  const cleanTags = tags
    .slice(0, 6)
    .map(t => String(t || '').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20))
    .filter(Boolean);

  return {
    valid: true,
    data: {
      title,
      description,
      category: category.slice(0, 30),
      tags: cleanTags,
      scripts: validatedScripts,
      userSlug,
    },
  };
}

/**
 * Validates IPO Family PAN Applicant input
 */
function validateApplicantInput(data = {}) {
  const name = String(data.name || '').trim();
  const pan = String(data.pan || '').trim().toUpperCase();

  if (!name || name.length < 2 || name.length > 60) {
    return { valid: false, error: 'Applicant name must be between 2 and 60 characters' };
  }

  if (!SAFE_TEXT_REGEX.test(name)) {
    return { valid: false, error: 'Applicant name contains prohibited special characters' };
  }

  if (!pan || !PAN_REGEX.test(pan)) {
    return { valid: false, error: 'Invalid Indian Income Tax PAN format (must be 5 letters, 4 numbers, 1 letter)' };
  }

  return {
    valid: true,
    data: {
      name,
      pan,
    },
  };
}

/**
 * Validates Plan Checkout input
 */
function validatePlanCheckout(data = {}) {
  const plan = String(data.plan || '').trim().toLowerCase();
  const billing = String(data.billing || 'monthly').trim().toLowerCase();
  const paymentMethod = String(data.paymentMethod || 'mock').trim().toLowerCase();
  const paymentRef = String(data.paymentRef || '').trim();

  if (!['pro', 'premium'].includes(plan)) {
    return { valid: false, error: 'Invalid membership plan selected' };
  }

  if (!['monthly', 'annual'].includes(billing)) {
    return { valid: false, error: 'Billing cycle must be monthly or annual' };
  }

  if (!['razorpay', 'upi', 'mock'].includes(paymentMethod)) {
    return { valid: false, error: 'Invalid payment method' };
  }

  if (paymentRef && paymentRef.length > 60) {
    return { valid: false, error: 'Payment reference ID too long' };
  }

  return {
    valid: true,
    data: {
      plan,
      billing,
      paymentMethod,
      paymentRef: paymentRef.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50),
    },
  };
}

module.exports = {
  SCRIP_CODE_REGEX,
  NSE_SYMBOL_REGEX,
  ISIN_REGEX,
  PAN_REGEX,
  SLUG_REGEX,
  validateSafeFilingUrl,
  validateScripInput,
  validateBasketInput,
  validateApplicantInput,
  validatePlanCheckout,
};
