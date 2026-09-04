import { doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { db, FIREBASE_ENABLED } from './firebase'
import { apiClient } from './apiClient'

const LOCAL_MODE = !FIREBASE_ENABLED

// ── Notification preferences ──────────────────────────────────────────────────

export async function getPrefs(uid) {
  if (typeof uid === 'object' && uid !== null) {
    uid = uid.uid || null
  }
  try {
    return await apiClient('/api/prefs')
  } catch (err) {
    if (LOCAL_MODE || !uid) return {}
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? (snap.data().prefs || {}) : {}
  }
}

export async function savePrefs(uid, prefs) {
  if (typeof uid === 'object' && uid !== null && prefs === undefined) {
    prefs = uid
    uid = null
  }
  try {
    return await apiClient('/api/prefs', { method: 'POST', body: JSON.stringify(prefs) })
  } catch (err) {
    if (LOCAL_MODE || !uid) throw err
    await setDoc(doc(db, 'users', uid), { prefs }, { merge: true })
    return prefs
  }
}

// ── Alert history ─────────────────────────────────────────────────────────────

export async function getAlerts(uid, limitN = 200) {
  if (LOCAL_MODE) {
    const data = await apiClient(`/api/alerts?limit=${limitN}`)
    return data.alerts || []
  }
  const q   = query(collection(db, 'users', uid, 'priceAlerts'), orderBy('triggeredAt', 'desc'), limit(limitN))
  const snp = await getDocs(q)
  return snp.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function deleteAlert(uid, alertId) {
  if (LOCAL_MODE) return apiClient(`/api/alerts/${encodeURIComponent(alertId)}`, { method: 'DELETE' })
  await deleteDoc(doc(db, 'users', uid, 'priceAlerts', alertId))
}

export async function getRecentAlerts(uid, since) {
  if (LOCAL_MODE) {
    const qs = since ? `?since=${encodeURIComponent(since)}` : ''
    const data = await apiClient(`/api/alerts/recent${qs}`)
    return data.alerts || []
  }
  // Firebase: just fetch last 20 sorted by triggeredAt desc and filter client-side
  const q   = query(collection(db, 'users', uid, 'priceAlerts'), orderBy('triggeredAt', 'desc'), limit(20))
  const snp = await getDocs(q)
  const all = snp.docs.map((d) => ({ id: d.id, ...d.data() }))
  if (!since) return all
  const sinceTs = new Date(since).getTime()
  return all.filter((a) => new Date(a.triggeredAt).getTime() > sinceTs)
}

export async function clearAllAlerts(uid) {
  if (LOCAL_MODE) return apiClient('/api/alerts', { method: 'DELETE' })
  const snp = await getDocs(collection(db, 'users', uid, 'priceAlerts'))
  await Promise.all(snp.docs.map((d) => deleteDoc(d.ref)))
}

// ── User profile creation ─────────────────────────────────────────────────────

export async function ensureUserProfile(uid, { displayName, email }) {
  if (LOCAL_MODE) return   // no Firestore in local mode
  try {
    const ref  = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        displayName: displayName || '',
        email:       email || '',
        tier:        'free',
        createdAt:   serverTimestamp(),
        prefs: { telegramEnabled: true, inAppEnabled: true, frequency: 'realtime' },
        ltdCodesIndex: [],
      })
    }
  } catch (e) {
    console.error('[ensureUserProfile]', e.message)
  }
}

// ── Tier helpers removed ──────────────────────────────────────────────────────
