import {
  collection, getDocs, getDoc, deleteDoc, updateDoc,
  doc, serverTimestamp, writeBatch, arrayUnion, arrayRemove,
  query, where, limit, setDoc,
} from 'firebase/firestore'
import { db, FIREBASE_ENABLED } from './firebase'
import { apiClient } from './apiClient'

const LOCAL_MODE = !FIREBASE_ENABLED

// Normalize any incoming script object to the canonical shape
function normalizeScript(data) {
  const ltdCode    = String(data.ltdCode  || data.bseCode || data.scripCode || data.scriptCode || '').trim()
  const symbol     = String(data.symbol   || data.nseSymbol || '').trim().toUpperCase()
  const scriptName = String(data.scriptName || data.name || ltdCode || symbol).trim()
  const exchange   = String(data.exchange || 'BOTH').trim().toUpperCase()
  const notes      = String(data.notes || '').trim()
  const isin       = String(data.isin || '').trim()
  const group      = String(data.group || '').trim()
  return { ltdCode, symbol, scriptName, exchange, notes, isin, group }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getWatchlist(uid) {
  if (LOCAL_MODE) {
    const data = await apiClient('/api/watchlist')
    return data.scripts || []
  }
  const snap = await getDocs(collection(db, 'users', uid, 'watchlist'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ── Add ───────────────────────────────────────────────────────────────────────

export async function addScript(uid, scriptData) {
  const { ltdCode, symbol, scriptName, exchange, notes, isin, group } = normalizeScript(scriptData)
  if (!ltdCode) throw new Error('scriptData must include an LTD Code')

  if (LOCAL_MODE) {
    return apiClient('/api/watchlist', {
      method: 'POST',
      body:   JSON.stringify({ ltdCode, symbol, scriptName, exchange, notes, isin, group }),
    })
  }

  const existing = await getDocs(
    query(collection(db, 'users', uid, 'watchlist'), where('ltdCode', '==', ltdCode), limit(1))
  )
  if (!existing.empty) return { id: existing.docs[0].id, alreadyExists: true }

  const ref = doc(collection(db, 'users', uid, 'watchlist'))
  await Promise.all([
    setDoc(ref, { ltdCode, symbol, scriptName, exchange, notes, isin, group, addedAt: serverTimestamp() }),
    setDoc(doc(db, 'users', uid), { ltdCodesIndex: arrayUnion(ltdCode) }, { merge: true }),
  ])
  return ref
}

// ── Remove ────────────────────────────────────────────────────────────────────

export async function removeScript(uid, docId) {
  if (LOCAL_MODE) {
    await apiClient(`/api/watchlist/${encodeURIComponent(docId)}`, { method: 'DELETE' })
    return
  }
  const ref  = doc(db, 'users', uid, 'watchlist', docId)
  const snap = await getDoc(ref)
  const ops  = [deleteDoc(ref)]
  if (snap.exists()) {
    const { ltdCode } = snap.data()
    if (ltdCode) ops.push(updateDoc(doc(db, 'users', uid), { ltdCodesIndex: arrayRemove(ltdCode) }))
  }
  await Promise.all(ops)
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateScript(uid, docId, data) {
  if (LOCAL_MODE) {
    await apiClient(`/api/watchlist/${encodeURIComponent(docId)}`, {
      method: 'PATCH',
      body:   JSON.stringify(data),
    })
    return
  }
  return updateDoc(doc(db, 'users', uid, 'watchlist', docId), data)
}

// ── Bulk add ──────────────────────────────────────────────────────────────────

export async function bulkAddScripts(uid, scripts) {
  if (LOCAL_MODE) {
    return apiClient('/api/watchlist/bulk', {
      method: 'POST',
      body:   JSON.stringify({ scripts }),
    })
  }

  const existingSnap  = await getDocs(collection(db, 'users', uid, 'watchlist'))
  const existingCodes = new Set(existingSnap.docs.map((d) => d.data().ltdCode).filter(Boolean))

  const toAdd  = []
  let  skipped = 0

  for (const script of scripts) {
    const { ltdCode, scriptName, exchange, notes } = normalizeScript(script)
    if (!ltdCode || !scriptName)    { skipped++; continue }
    if (existingCodes.has(ltdCode)) { skipped++; continue }
    existingCodes.add(ltdCode)
    toAdd.push({ ltdCode, scriptName, exchange, notes })
  }

  if (!toAdd.length) return { added: 0, skipped }

  const BATCH_SIZE = 400
  for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const item of toAdd.slice(i, i + BATCH_SIZE)) {
      batch.set(doc(collection(db, 'users', uid, 'watchlist')), { ...item, addedAt: serverTimestamp() })
    }
    await batch.commit()
  }

  const newCodes = toAdd.map((t) => t.ltdCode)
  await setDoc(doc(db, 'users', uid), { ltdCodesIndex: arrayUnion(...newCodes) }, { merge: true })

  return { added: toAdd.length, skipped }
}

// ── Clear ─────────────────────────────────────────────────────────────────────

export async function clearWatchlist(uid) {
  if (LOCAL_MODE) {
    await apiClient('/api/watchlist/all', { method: 'DELETE' })
    return
  }
  const snap = await getDocs(collection(db, 'users', uid, 'watchlist'))
  if (snap.empty) return
  const BATCH_SIZE = 400
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  await updateDoc(doc(db, 'users', uid), { ltdCodesIndex: [] })
}
