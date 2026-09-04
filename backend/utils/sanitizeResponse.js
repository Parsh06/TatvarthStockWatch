'use strict';

const { maskPan } = require('../lib/ipoUtils');

/**
 * sanitizeResponse.js
 * Explicit DTO serializers to prevent accidental leakage of database IDs,
 * user UIDs, encrypted payloads, internal credentials, or internal metadata.
 */

function sanitizeWatchlistScript(script) {
  if (!script || typeof script !== 'object') return null;
  return {
    id: String(script.id || script._id || ''),
    ltdCode: String(script.ltdCode || script.bseCode || script.scripCode || '').trim(),
    symbol: String(script.symbol || script.nseSymbol || '').trim().toUpperCase(),
    scriptName: String(script.scriptName || script.name || '').trim(),
    exchange: String(script.exchange || 'BOTH').trim().toUpperCase(),
    notes: String(script.notes || ''),
    group: String(script.group || ''),
    isin: String(script.isin || ''),
    addedAt: script.addedAt ? new Date(script.addedAt).toISOString() : null,
  };
}

function sanitizeApplicant(applicant) {
  if (!applicant || typeof applicant !== 'object') return null;
  const rawPan = applicant.pan || '';
  const panLast4 = applicant.panLast4 || (rawPan ? rawPan.slice(-4) : 'XXXX');
  return {
    id: String(applicant.id || applicant._id || ''),
    name: String(applicant.name || 'Applicant').trim().slice(0, 50),
    maskedPan: rawPan ? maskPan(rawPan) : maskPan('XXXXXX' + panLast4),
    createdAt: applicant.createdAt ? new Date(applicant.createdAt).toISOString() : null,
  };
}

function sanitizeNotification(notification) {
  if (!notification || typeof notification !== 'object') return null;
  return {
    id: String(notification.id || notification._id || ''),
    exchange: String(notification.exchange || 'BSE'),
    scriptName: String(notification.scriptName || ''),
    scriptCode: String(notification.scriptCode || ''),
    category: String(notification.category || ''),
    subCategory: String(notification.subCategory || ''),
    subject: String(notification.subject || ''),
    announcementDate: String(notification.announcementDate || ''),
    pdfUrl: notification.pdfUrl ? String(notification.pdfUrl) : null,
    critical: Boolean(notification.critical),
    read: Boolean(notification.read),
    createdAt: notification.createdAt ? new Date(notification.createdAt).toISOString() : null,
  };
}

function sanitizeDashboardOverview(overview) {
  if (!overview || typeof overview !== 'object') return overview;
  const clean = { ...overview };

  // Remove any top-level user identifiers if attached
  delete clean.userId;
  delete clean.uid;
  delete clean.firebaseUid;

  // Sanitize watchlist section inside overview
  if (clean.watchlist && typeof clean.watchlist === 'object') {
    delete clean.watchlist.userId;
    delete clean.watchlist.uid;
    if (Array.isArray(clean.watchlist.topCompanies)) {
      clean.watchlist.topCompanies = clean.watchlist.topCompanies.map(c => ({
        name: String(c.name || ''),
        bseCode: String(c.bseCode || ''),
        symbol: String(c.symbol || ''),
        total: Number(c.total || 0),
        bse: Number(c.bse || 0),
        nse: Number(c.nse || 0),
      }));
    }
  }

  return clean;
}

module.exports = {
  sanitizeWatchlistScript,
  sanitizeApplicant,
  sanitizeNotification,
  sanitizeDashboardOverview,
};
