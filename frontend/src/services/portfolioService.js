/**
 * portfolioService — dual-mode (local REST ↔ Firestore)
 * L1: localStorage (instant read/write, always)
 * L2: backend REST or Firestore (debounced, async)
 *
 * Shape: { holdings: [...], updatedAt: ISO }
 */
import { FIREBASE_ENABLED, db } from './firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const BACKEND      = import.meta.env.VITE_BACKEND_URL || '';
const LS_KEY       = 'portfolio_holdings_v2';
const LS_DIRTY_KEY = 'portfolio_holdings_dirty';

// ── localStorage helpers ──────────────────────────────────────────────────────
export function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function lsSave(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    localStorage.setItem(LS_DIRTY_KEY, '1');
  } catch {}
}

// ── Remote load (once on mount) ───────────────────────────────────────────────
export async function loadPortfolio(uid) {
  if (!FIREBASE_ENABLED) {
    // local REST
    const res  = await fetch(`${BACKEND}/api/portfolio`);
    const data = await res.json();
    return data;
  }
  // Firestore
  const ref  = doc(db, 'users', uid, 'portfolio', 'data');
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : { holdings: [], updatedAt: null };
}

// ── Remote save (called debounced) ────────────────────────────────────────────
export async function savePortfolio(uid, data) {
  if (!FIREBASE_ENABLED) {
    const res = await fetch(`${BACKEND}/api/portfolio`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`PUT /api/portfolio → ${res.status}`);
    localStorage.removeItem(LS_DIRTY_KEY);
    return;
  }
  // Firestore — single doc, no per-holding subcollection (cheap reads)
  const ref = doc(db, 'users', uid, 'portfolio', 'data');
  await setDoc(ref, { ...data, updatedAt: new Date().toISOString() });
  localStorage.removeItem(LS_DIRTY_KEY);
}

// ── useDebouncedSave helper ───────────────────────────────────────────────────
// Returns a function that, when called with (uid, data), waits `delay` ms
// before persisting.  Calling it again within the window resets the timer.
let _saveTimer = null;
export function debouncedSave(uid, data, delay = 2000) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try { await savePortfolio(uid, data); }
    catch (e) { console.warn('[portfolioService] save failed:', e.message); }
  }, delay);
}
