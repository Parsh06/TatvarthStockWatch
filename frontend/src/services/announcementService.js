import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
  limit,
  writeBatch,
  where,
} from 'firebase/firestore'
import { db, FIREBASE_ENABLED } from './firebase'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''
import { apiClient } from './apiClient'

// ─── Announcement fetching ────────────────────────────────────────────────────

/**
 * Read announcements from the global Firestore `announcements` collection.
 * This is the primary source after the cron has run at least once.
 *
 * @param {{ exchange?: string, scripCode?: string, limitCount?: number }} opts
 */
export async function getAnnouncementsFromDB({ exchange, scripCode, limitCount = 100 } = {}) {
  // Alias to the backend proxy which now reads from MongoDB
  return fetchSavedAnnouncements({ exchange, scripCode, limitCount })
}

/**
 * Fetch live announcements from the Vercel backend (which calls BSE/NSE APIs).
 * Falls back to empty array on error — callers decide what to show.
 */
export async function fetchAnnouncements({ exchange, scripCode, fromDate, toDate } = {}) {
  const params = new URLSearchParams()
  if (exchange) params.set('exchange', exchange)
  if (scripCode) params.set('scripCode', scripCode)
  if (fromDate) params.set('fromDate', fromDate)
  if (toDate) params.set('toDate', toDate)
  const json = await apiClient(`/api/announcements?${params.toString()}`)
  return Array.isArray(json) ? json : (json.data || [])
}

/**
 * Fetch saved (DB-persisted) announcements via backend proxy.
 * Lighter than the live BSE/NSE fetch — reads from Firestore.
 */
export async function fetchSavedAnnouncements({ exchange, scripCode, limitCount } = {}) {
  const params = new URLSearchParams()
  if (exchange && exchange !== 'ALL') params.set('exchange', exchange)
  if (scripCode) params.set('scripCode', scripCode)
  if (limitCount) params.set('limit', String(limitCount))
  const json = await apiClient(`/api/announcements/saved?${params.toString()}`)
  return Array.isArray(json) ? json : (json.data || [])
}

export async function fetchBSEAnnouncements(scripCode) {
  const json = await apiClient(`/api/announcements/bse?scripCode=${encodeURIComponent(scripCode || '')}`)
  return Array.isArray(json) ? json : (json.data || [])
}

export async function fetchNSEAnnouncements(symbol) {
  const json = await apiClient(`/api/announcements/nse?symbol=${encodeURIComponent(symbol || '')}`)
  return Array.isArray(json) ? json : (json.data || [])
}

// Uses BSE company listing API via backend proxy
export async function searchBSEScripts(queryStr) {
  try {
    const json = await apiClient(`/api/bse/search?q=${encodeURIComponent(queryStr)}`)
    return Array.isArray(json) ? json : (json.data || [])
  } catch {
    return []
  }
}

export async function triggerEmailNotification(userEmail, userName, announcements) {
  return apiClient(`/api/notify/email`, {
    method: 'POST',
    body: JSON.stringify({ userEmail, userName, announcements }),
  })
}

// ─── Notifications (per-user Firestore) ──────────────────────────────────────

export async function getNotifications(uid) {
  if (!FIREBASE_ENABLED || !db) return []
  const q = query(
    collection(db, 'users', uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(50)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function markNotificationRead(uid, notifId) {
  if (!FIREBASE_ENABLED || !db) return
  return updateDoc(doc(db, 'users', uid, 'notifications', notifId), { read: true })
}

export async function markAllNotificationsRead(uid) {
  if (!FIREBASE_ENABLED || !db) return
  const q = query(
    collection(db, 'users', uid, 'notifications'),
    where('read', '==', false)
  )
  const snap = await getDocs(q)
  if (snap.empty) return

  const BATCH_LIMIT = 500
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.update(d.ref, { read: true }))
    await batch.commit()
  }
}
