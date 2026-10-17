/**
 * Auth-aware API client.
 *
 * When Firebase is enabled and a user is signed in, automatically attaches a
 * Firebase ID token as `Authorization: Bearer <token>` on every request.
 * In local/demo mode (no Firebase) calls go through unchanged.
 *
 * Drop-in replacement for raw `fetch` — same signature, returns parsed JSON.
 */

import { onAuthStateChanged } from 'firebase/auth'
import { auth, FIREBASE_ENABLED } from './firebase'

async function getToken() {
  if (!FIREBASE_ENABLED) return null

  if (auth?.currentUser) {
    try {
      return await auth.currentUser.getIdToken(/* forceRefresh= */ false)
    } catch {
      return null
    }
  }

  // If Firebase is initializing on app start, wait for initial Auth state
  return new Promise((resolve) => {
    let resolved = false
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (resolved) return
      resolved = true
      try { unsubscribe() } catch {}
      if (user) {
        try {
          resolve(await user.getIdToken(false))
        } catch {
          resolve(null)
        }
      } else {
        resolve(null)
      }
    })
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        try { unsubscribe() } catch {}
        resolve(null)
      }
    }, 2500)
  })
}

export async function apiClient(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  const token = await getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const backendUrl = import.meta.env.VITE_BACKEND_URL || ''
  const finalUrl = url.startsWith('/') ? `${backendUrl}${url}` : url;

  const res = await fetch(finalUrl, { ...options, headers })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {}

    if (res.status === 403 && (parsed?.code === 'ACCOUNT_DISABLED' || parsed?.disabled)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sw:account-disabled', {
          detail: {
            error: parsed?.error || 'Your account has been disabled by administrator.',
            reason: parsed?.reason || parsed?.error,
            code: 'ACCOUNT_DISABLED',
          }
        }))
      }
    }

    throw new Error(parsed?.error || `API ${options.method || 'GET'} ${url} failed (${res.status}): ${text}`)
  }

  return res.json()
}
