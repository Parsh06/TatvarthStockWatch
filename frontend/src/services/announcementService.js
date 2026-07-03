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

// ─── Announcement fetching ────────────────────────────────────────────────────

/**
 * Read announcements from the global Firestore `announcements` collection.
 * This is the primary source after the cron has run at least once.
 *
 * @param {{ exchange?: string, scripCode?: string, limitCount?: number }} opts
 */
export async function getAnnouncementsFromDB({ exchange, scripCode, limitCount = 100 } = {}) {
  if (!FIREBASE_ENABLED || !db) return []
  let q = query(
    collection(db, 'announcements'),
    orderBy('announcementDate', 'desc'),
    limit(limitCount)
  )

  // Firestore compound queries need composite indexes; use simple single-field filter
  if (scripCode) {
    q = query(
      collection(db, 'announcements'),
      where('scriptCode', '==', scripCode),
      orderBy('announcementDate', 'desc'),
      limit(limitCount)
    )
  } else if (exchange && exchange !== 'ALL') {
    q = query(
      collection(db, 'announcements'),
      where('exchange', '==', exchange),
      orderBy('announcementDate', 'desc'),
      limit(limitCount)
    )
  }

  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ ...d.data() }))
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
  const res = await fetch(`${BACKEND_URL}/api/announcements?${params.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch announcements: ${res.statusText}`)
  const json = await res.json()
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
  const res = await fetch(`${BACKEND_URL}/api/announcements/saved?${params.toString()}`)
  if (!res.ok) throw new Error(`Saved announcements fetch failed: ${res.statusText}`)
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data || [])
}

export async function fetchBSEAnnouncements(scripCode) {
  const res = await fetch(`${BACKEND_URL}/api/announcements/bse?scripCode=${encodeURIComponent(scripCode || '')}`)
  if (!res.ok) throw new Error(`BSE fetch failed: ${res.statusText}`)
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data || [])
}

export async function fetchNSEAnnouncements(symbol) {
  const res = await fetch(`${BACKEND_URL}/api/announcements/nse?symbol=${encodeURIComponent(symbol || '')}`)
  if (!res.ok) throw new Error(`NSE fetch failed: ${res.statusText}`)
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data || [])
}

// Uses BSE company listing API via backend proxy
export async function searchBSEScripts(queryStr) {
  const res = await fetch(`${BACKEND_URL}/api/bse/search?q=${encodeURIComponent(queryStr)}`)
  if (!res.ok) return []
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data || [])
}

export async function triggerEmailNotification(userEmail, userName, announcements) {
  const res = await fetch(`${BACKEND_URL}/api/notify/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail, userName, announcements }),
  })
  if (!res.ok) throw new Error(`Email notification failed: ${res.statusText}`)
  return res.json()
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
