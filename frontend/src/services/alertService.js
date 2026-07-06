import { doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { db, FIREBASE_ENABLED } from './firebase'
import { apiClient } from './apiClient'

const LOCAL_MODE = !FIREBASE_ENABLED

// ── Notification preferences ──────────────────────────────────────────────────

export async function getPrefs(uid) {
  if (LOCAL_MODE) return apiClient('/api/prefs')
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? (snap.data().prefs || {}) : {}
  } catch { return {} }
}

export async function savePrefs(uid, prefs) {
  if (LOCAL_MODE) return apiClient('/api/prefs', { method: 'POST', body: JSON.stringify(prefs) })
  await setDoc(doc(db, 'users', uid), { prefs }, { merge: true })
  return prefs
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

// ── Price alert threshold update ──────────────────────────────────────────────

export async function setScriptAlert(uid, scriptId, { alertAbove, alertBelow, alertEnabled }) {
  if (LOCAL_MODE) {
    return apiClient(`/api/watchlist/${encodeURIComponent(scriptId)}/alert`, {
      method: 'PATCH',
      body:   JSON.stringify({ alertAbove, alertBelow, alertEnabled }),
    })
  }
  const { updateScript } = await import('./watchlistService')
  return updateScript(uid, scriptId, { alertAbove, alertBelow, alertEnabled })
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

// ── Tier helpers ──────────────────────────────────────────────────────────────

export async function getUserTier(uid) {
  if (LOCAL_MODE) return 'premium'   // local dev = full access
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? (snap.data().tier || 'free') : 'free'
  } catch { return 'free' }
}

export async function upgradeToPremium(uid) {
  if (LOCAL_MODE) return
  await setDoc(doc(db, 'users', uid), { tier: 'premium' }, { merge: true })
}
