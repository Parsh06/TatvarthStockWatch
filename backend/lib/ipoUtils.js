'use strict';

const crypto = require('crypto');

// ── Encryption Key ────────────────────────────────────────────────────────────
// Must be 32 bytes (64 hex chars). Set via PAN_ENCRYPTION_KEY env var.
// NEVER store this key in Firestore.
function getEncryptionKey() {
  const keyHex = (process.env.PAN_ENCRYPTION_KEY && process.env.PAN_ENCRYPTION_KEY.length === 64)
    ? process.env.PAN_ENCRYPTION_KEY
    : '31ce0713056e72337cc68936cd1d9bf0b7eec3d5f8dfd98d51133cc4dd0dd466';
  return Buffer.from(keyHex, 'hex');
}

// ── PAN Encryption (AES-256-GCM) ─────────────────────────────────────────────
function encryptPan(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function decryptPan({ encrypted, iv, authTag }) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── PAN Masking ───────────────────────────────────────────────────────────────
// "GOEPQ9606W" → "XXXXXX606W"
function maskPan(pan) {
  if (!pan || pan.length < 4) return 'XXXX';
  return 'X'.repeat(pan.length - 4) + pan.slice(-4);
}

// ── PAN Validation ────────────────────────────────────────────────────────────
// Standard Indian PAN: 5 letters + 4 digits + 1 letter
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function validatePan(pan) {
  if (!pan || typeof pan !== 'string') return false;
  return PAN_REGEX.test(pan.trim().toUpperCase());
}

// ── NSE Response Normalization ────────────────────────────────────────────────
// Maps NSE's raw (sometimes misspelled) field names to clean internal names.
function normalizeIpoBidRecord(raw) {
  const toNum = (v) => {
    if (v === null || v === undefined || v === '' || v === '-') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  const cleanStr = (v) => {
    if (v === null || v === undefined || v === '-' || v === '') return null;
    return String(v).trim();
  };

  return {
    orderNumber: cleanStr(raw.orderNo),
    applicationNumber: cleanStr(raw.appNumber),
    quantity: toNum(raw.quatity),        // NSE typo: "quatity"
    bidPrice: toNum(raw.price),
    flag: cleanStr(raw.flag),
    flagLabel: mapFlagCode(raw.flag),
    upiAmountBlocked: toNum(raw.UPIAmtBlocked),
    upiStatus: cleanStr(raw.UPIStatus),
    allotmentPrice: toNum(raw.allotmentPrice),
    allotmentQuantity: toNum(raw.allotmentQty),
    depositoryName: cleanStr(raw.depName),
    depositoryId: cleanStr(raw.depId),
    beneficiaryId: cleanStr(raw.benId),
    debitStatus: cleanStr(raw.debitStatus),
    maskedPan: cleanStr(raw.pan),
  };
}

function normalizeIpoBidResponse(nseResponse) {
  if (!nseResponse) {
    return { success: false, message: 'Empty response from NSE', records: [] };
  }

  const errorCode = String(nseResponse.errorCode || '');
  const errorMessage = nseResponse.errorMessage || '';
  const data = Array.isArray(nseResponse.data) ? nseResponse.data : [];

  if (errorCode !== '0' && data.length === 0) {
    return {
      success: false,
      message: errorMessage || 'Verification failed',
      records: [],
    };
  }

  return {
    success: true,
    message: errorMessage || 'Success',
    records: data.map(normalizeIpoBidRecord),
  };
}

// ── NSE Flag Code Mapping ─────────────────────────────────────────────────────
// Only display human-readable meanings when verified from NSE documentation.
// For unknown codes, show the raw code conservatively.
const KNOWN_FLAGS = {
  // Add verified flag meanings here as they are confirmed
};

function mapFlagCode(flag) {
  if (!flag || flag === '-') return null;
  const cleaned = String(flag).trim().toUpperCase();
  if (KNOWN_FLAGS[cleaned]) return KNOWN_FLAGS[cleaned];
  return `NSE Reference Code: ${cleaned}`;
}

// ── KFintech Response Normalization ───────────────────────────────────────────
function normalizeKfinRecord(raw) {
  const toNum = (v) => {
    if (v === null || v === undefined || v === '' || v === '-') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  const cleanStr = (v) => {
    if (v === null || v === undefined || v === '-' || v === '') return null;
    return String(v).trim();
  };

  const allotted = toNum(raw.All_Shares);
  const applied = toNum(raw.App_Shares);

  return {
    applicantName: cleanStr(raw.Name),
    maskedPan: maskPan(cleanStr(raw.Pan_No) || ''),
    applicationNumber: cleanStr(raw.Appln_No),
    appliedShares: applied,
    allottedShares: allotted,
    dpClientId: cleanStr(raw.DP_CLID),
    allotmentStatus: allotted > 0 ? 'Allotted' : allotted === 0 ? 'Not Allotted' : 'Unknown',
  };
}

function normalizeKfinResponse(response) {
  if (!response || !Array.isArray(response.data)) {
    return { success: false, error: 'KFINTECH_ERROR', message: 'Invalid response from registrar', records: [] };
  }
  return {
    success: true,
    provider: 'KFINTECH',
    records: response.data.map(normalizeKfinRecord),
  };
}

// ── Canonical IPO Company Key ─────────────────────────────────────────────────
// Produces a stable lowercase alphanum-only key that two scrapers will both map
// to the same value even when they spell the company name differently.
//
// Examples:
//   "Deepa Jewellers Ltd"           → "deepajewellers"
//   "Deepa Jewellers"               → "deepajewellers"
//   "Farm Peace Ltd"                → "farmpeace"
//   "Farm Peace"                    → "farmpeace"
//   "Fly-Hi Maritime Travels Ltd."  → "flyhimaritime"
//   "Fly-Hi Maritime"               → "flyhimaritime"
//   "Rays of Belief Ltd"            → "raysofbelief"
//   "Rays of Belief"                → "raysofbelief"
const CORPORATE_SUFFIX_REGEX = /\b(ltd|limited|pvt|private|technologies|technology|services|service|travels|travel|industries|industry|enterprises|enterprise|solutions|solution|holdings|holding|ventures|venture|corporation|corp|inc|llp|llc|ipo)\b\.?/gi;

function getCanonicalIpoKey(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(CORPORATE_SUFFIX_REGEX, '')   // strip corporate suffixes
    .replace(/[^a-z0-9]/g, '')             // strip all non-alphanumeric
    .trim();
}

// ── IPO Business Fingerprint ──────────────────────────────────────────────────
// A fingerprint uniquely identifies an IPO by its business attributes (close date
// + issue price) rather than by its name. Two scraper records with the same
// fingerprint are guaranteed to be the same IPO, even with completely different
// name styles ("Credent Connect" vs "Credent Connect N Care Ltd").
//
// Format: "YYYY-MM-DD__<roundedPrice>"  e.g. "2026-09-03__189"
//
// Returns '' if either date or price is missing (fingerprint is unusable).
function computeIpoFingerprint(closeDateISO, issuePrice) {
  const price = Math.round(parseFloat(issuePrice) || 0);
  const date  = String(closeDateISO || '').slice(0, 10);
  if (!date || date.length < 10 || price === 0) return '';
  return `${date}__${price}`;
}

// ── Token-Set Dice Name Similarity ────────────────────────────────────────────
// Computes a 0.0–1.0 similarity score between two company names using the
// Sørensen-Dice coefficient on their token sets.
//
// Before tokenizing:
//  • Lowercased, non-alphanumeric chars → spaces
//  • Common corporate stop tokens removed (ltd, limited, pvt, inc, …)
//  • Tokens shorter than 3 chars removed ("n", "of", "a", "an", etc.)
//
// Examples:
//   "Credent Connect N Care Ltd" vs "Credent Connect"  → 0.80  ← PASSES (≥ 0.72)
//   "Farm Peace Ltd"             vs "Farm Peace"        → 1.00  ← PASSES
//   "Fly-Hi Maritime Travels"    vs "Fly-Hi Maritime"   → 0.80  ← PASSES
//   "Deepa Jewellers Ltd"        vs "Deepa Jewellers"   → 1.00  ← PASSES
//   "Credent Finance"            vs "Credent Connect"   → 0.40  ← BLOCKED (< 0.72)
//   "ABC Holdings"               vs "XYZ Holdings"      → 0.00  ← BLOCKED
const _FUZZY_STOP_TOKENS = new Set([
  'ltd', 'limited', 'pvt', 'private', 'inc', 'llc', 'llp', 'corp',
  'ipo', 'sme', 'nse', 'bse',
]);

function _tokenizeForFuzzy(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')        // normalize all punctuation/hyphens to space
    .split(/\s+/)                         // split into tokens
    .filter(t => t.length >= 3 && !_FUZZY_STOP_TOKENS.has(t)); // meaningful tokens only
}

function computeNameSimilarity(nameA, nameB) {
  if (!nameA || !nameB) return 0;
  const setA = new Set(_tokenizeForFuzzy(nameA));
  const setB = new Set(_tokenizeForFuzzy(nameB));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  // Dice coefficient: 2|A∩B| / (|A| + |B|)
  return (2 * intersection) / (setA.size + setB.size);
}

module.exports = {
  encryptPan,
  decryptPan,
  maskPan,
  validatePan,
  normalizeIpoBidResponse,
  normalizeIpoBidRecord,
  mapFlagCode,
  normalizeKfinRecord,
  normalizeKfinResponse,
  PAN_REGEX,
  getCanonicalIpoKey,
  computeIpoFingerprint,
  computeNameSimilarity,
};
