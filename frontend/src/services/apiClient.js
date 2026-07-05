/**
 * Auth-aware API client.
 *
 * When Firebase is enabled and a user is signed in, automatically attaches a
 * Firebase ID token as `Authorization: Bearer <token>` on every request.
 * In local/demo mode (no Firebase) calls go through unchanged.
 *
 * Drop-in replacement for raw `fetch` — same signature, returns parsed JSON.
 */

import { auth, FIREBASE_ENABLED } from './firebase'

async function getToken() {
  if (!FIREBASE_ENABLED || !auth?.currentUser) return null
  try {
    return await auth.currentUser.getIdToken(/* forceRefresh= */ false)
  } catch {
    return null
  }
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
    throw new Error(`API ${options.method || 'GET'} ${url} failed (${res.status}): ${text}`)
  }

  return res.json()
}
