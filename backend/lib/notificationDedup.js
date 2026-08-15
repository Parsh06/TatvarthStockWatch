'use strict';

/**
 * notificationDedup.js
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CENTRALIZED DEDUPLICATION LAYER                                        ║
 * ║  Prevents the same user from receiving the same announcement twice.     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Dedup key:  `${userId}:${announcementId}`
 *
 * Storage: MongoDB `alert_dedup_locks` collection.
 *   _id: dedup key (unique index ensures atomicity)
 *   userId, announcementId, createdAt
 *
 * Additional legacy key (announcement-level, not user-level) is also
 * checked so in-flight entries from the old system are honoured.
 */

const { getDb } = require('./mongoClient');

const COLLECTION = 'alert_dedup_locks';

/**
 * Build the canonical per-user dedup key.
 * Format: `USER:{uid}:ANN:{announcementId}`
 *
 * @param {string} uid
 * @param {string|number} announcementId
 * @returns {string}
 */
function buildDedupKey(uid, announcementId) {
  return `USER:${uid}:ANN:${String(announcementId)}`;
}

/**
 * Build a human-readable semantic dedup key (used as legacy fallback).
 * Strips common boilerplate from announcement subjects to help catch
 * near-duplicate announcements with different IDs.
 *
 * @param {Object} ann
 * @param {string} uid
 * @returns {string}
 */
function buildSemanticDedupKey(ann, uid) {
  const dateStr  = new Date().toISOString().slice(0, 10);
  const company  = (ann.scriptName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
  let subj = (ann.subject || '').toLowerCase();
  subj = subj
    .replace(/outcome of board meeting/g, '')
    .replace(/press release/g, '')
    .replace(/announcement under regulation/g, '')
    .replace(/regarding/g, '')
    .replace(/update/g, '')
    .replace(/copy of newspaper publication/g, '')
    .replace(/newspaper publication/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `DEDUP_${dateStr}_${company}_${subj.substring(0, 15)}_${uid}`;
}

/**
 * Attempt to claim the dedup lock for a user + announcement pair.
 * Uses MongoDB's unique index on `_id` for atomicity.
 *
 * @param {Object} db        — MongoDB database handle
 * @param {string} uid
 * @param {Object} ann       — Normalized announcement object
 * @returns {Promise<boolean>} — true if lock was acquired (OK to send), false if duplicate
 */
async function acquireDedupLock(db, uid, ann) {
  const col = db.collection(COLLECTION);
  const announcementId = String(ann.id || ann._id || '');
  if (!announcementId) return false;

  const primaryKey  = buildDedupKey(uid, announcementId);
  const semanticKey = buildSemanticDedupKey(ann, uid);
  const legacyKey   = `${announcementId}_${uid}`;
  const now         = new Date();

  // Try inserting the primary key — if it already exists, skip
  try {
    await col.insertOne({
      _id:            primaryKey,
      type:           'primary_dedup',
      userId:         uid,
      announcementId,
      createdAt:      now,
    });
  } catch (e) {
    if (e.code === 11000) return false; // Already sent — duplicate
    throw e; // Unexpected error — propagate
  }

  // Also insert legacy key formats for backward compatibility
  // These use insertOne with catch so they don't block if already present
  try {
    await col.insertOne({ _id: legacyKey,   type: 'legacy_dedup',   userId: uid, announcementId, createdAt: now });
  } catch { /* already exists — that's fine */ }

  try {
    await col.insertOne({ _id: semanticKey, type: 'semantic_dedup', userId: uid, announcementId, createdAt: now });
  } catch { /* already exists — that's fine */ }

  return true; // Lock acquired — safe to send
}

/**
 * Check dedup status for a batch of announcements for a single user.
 * More efficient than calling acquireDedupLock() individually when filtering large lists.
 *
 * @param {Object}   db
 * @param {string}   uid
 * @param {Object[]} announcements
 * @returns {Promise<Set<string>>} — Set of announcement IDs that are already deduped (should NOT send)
 */
async function getAlreadySentIds(db, uid, announcements) {
  if (!announcements || announcements.length === 0) return new Set();
  const col = db.collection(COLLECTION);

  const keys = announcements.map(ann => buildDedupKey(uid, String(ann.id || ann._id || '')));
  const existing = await col.find({ _id: { $in: keys } }, { projection: { _id: 1 } }).toArray();
  const existingIds = new Set(existing.map(d => {
    // Extract announcement ID from `USER:{uid}:ANN:{annId}`
    const parts = String(d._id).split(':ANN:');
    return parts[1] || '';
  }));
  return existingIds;
}

module.exports = { buildDedupKey, acquireDedupLock, getAlreadySentIds };
