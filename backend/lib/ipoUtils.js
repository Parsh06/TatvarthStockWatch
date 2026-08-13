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
};
