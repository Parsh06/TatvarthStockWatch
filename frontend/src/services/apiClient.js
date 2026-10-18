/**
 * Hybrid Multi-Host Auth-Aware API Client.
 *
 * Distributes workload between:
 * 1. Vercel Serverless Edge: High-concurrency, fast stateless client requests (Announcements, Search, Watchlist, Prefs, AI Analysis, Dashboard).
 * 2. Render Cloud Service: Continuous 24/7 background worker engine (Scheduled scraping, Push notifications, Telegram alerts, Heavy admin operations).
 *
 * Self-Healing Zero-Downtime Guarantee:
 * - Worker routes (/api/trigger, /api/cron/*, /api/admin/system/*) always route to Render.
 * - Stateless API routes attempt Vercel when healthy.
 * - If Vercel is unavailable (network error, 402 payment, 404, 5xx), the client seamlessly and
 *   transparently retries the request against Render with zero error popups to the user.
 * - A silent background probe periodically monitors Vercel health without blocking UI threads.
 */

import { onAuthStateChanged } from 'firebase/auth'
import { auth, FIREBASE_ENABLED } from './firebase'

// ── Host Endpoints ─────────────────────────────────────────────────────────────
const RENDER_BASE_URL = (
  import.meta.env.VITE_RENDER_WORKER_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  'https://tatvarthstockwatch.onrender.com'
).replace(/\/$/, '')

const VERCEL_BASE_URL = (
  import.meta.env.VITE_VERCEL_API_URL || ''
).replace(/\/$/, '')

const isLocalDev = Boolean(
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  (import.meta.env.VITE_BACKEND_URL || '').includes('localhost')
)

// ── Worker & Long-Running Maintenance Routes (Exclusively Render) ──────────────
const WORKER_ROUTE_PATTERNS = [
  /^\/api\/trigger(\/|$)/,
  /^\/api\/cron(\/|$)/,
  /^\/api\/admin\/system\/trigger-cron/,
  /^\/api\/admin\/system\/trigger-wipe/,
  /^\/api\/admin\/system\/test-service/,
  /^\/api\/admin\/system\/test-push/,
  /^\/api\/admin\/system\/export-backup/,
  /^\/api\/telegram-test/,
  /^\/api\/telegram-status/,
]

export function isWorkerRoute(path) {
  if (!path || typeof path !== 'string') return false
  const cleanPath = path.split('?')[0].split('#')[0]
  return WORKER_ROUTE_PATTERNS.some((pattern) => pattern.test(cleanPath))
}

// ── Circuit Breaker & Health State ─────────────────────────────────────────────
let isVercelHealthy = false
let lastVercelProbe = 0
let isProbingVercel = false
const VERCEL_PROBE_INTERVAL_MS = 60000 // Probe at most once per 60s
const VERCEL_COOLDOWN_MS = 120000 // 2 min backoff on hard failure
const VERCEL_REQUEST_TIMEOUT_MS = 6500 // 6.5s timeout on Vercel to guarantee sub-second failover

/**
 * Silent non-blocking probe for Vercel Serverless health.
 */
export async function probeVercelHealth(force = false) {
  if (isLocalDev || !VERCEL_BASE_URL) return false
  if (isProbingVercel && !force) return isVercelHealthy
  if (!force && Date.now() - lastVercelProbe < VERCEL_PROBE_INTERVAL_MS) return isVercelHealthy

  isProbingVercel = true
  lastVercelProbe = Date.now()

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`${VERCEL_BASE_URL}/api/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json().catch(() => null)
      if (data?.status === 'ok') {
        if (!isVercelHealthy) {
          console.info('[Hybrid Architecture] Vercel Serverless Gateway verified ONLINE. Elevating to primary client API host.')
        }
        isVercelHealthy = true
        return true
      }
    }
    isVercelHealthy = false
    return false
  } catch {
    isVercelHealthy = false
    return false
  } finally {
    isProbingVercel = false
  }
}

// Kick off silent background probe after application hydration only if VERCEL_BASE_URL is configured
if (typeof window !== 'undefined' && !isLocalDev && VERCEL_BASE_URL) {
  setTimeout(() => {
    probeVercelHealth().catch(() => {})
  }, 2500)
}

/**
 * Inspect live topology and active gateway status.
 */
export function getHybridArchitectureStatus() {
  return {
    mode: isLocalDev ? 'Local Development' : 'Hybrid Multi-Host (Vercel + Render)',
    activeClientGateway: isVercelHealthy ? 'Vercel Serverless (Global Edge)' : 'Render Web Service (Failover Active)',
    workerEngine: 'Render (Autonomous 24/7 Background Scraping & Push Engine)',
    isVercelHealthy,
    isLocalDev,
    vercelUrl: VERCEL_BASE_URL,
    renderUrl: RENDER_BASE_URL,
  }
}

// ── Firebase Auth Token Acquisition ───────────────────────────────────────────
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

// ── Core Fetch with Transparent Failover ──────────────────────────────────────
async function executeRequest(targetUrl, options, headers, timeoutMs = null) {
  if (!timeoutMs) {
    return fetch(targetUrl, { ...options, headers })
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer)
      controller.abort()
    } else {
      options.signal.addEventListener('abort', () => {
        clearTimeout(timer)
        controller.abort()
      }, { once: true })
    }
  }

  try {
    const res = await fetch(targetUrl, { ...options, headers, signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    if (timedOut) {
      const timeoutErr = new Error(`Connection to gateway timed out after ${timeoutMs}ms`)
      timeoutErr.name = 'TimeoutError'
      throw timeoutErr
    }
    throw err
  }
}

export async function apiClient(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  const token = await getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  // 1. If absolute URL was passed, fetch directly
  if (!url.startsWith('/')) {
    const res = await executeRequest(url, options, headers)
    return handleResponse(res, url, options)
  }

  // 2. If running locally, route directly to local dev server
  if (isLocalDev) {
    const localTarget = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}${url}`
    const res = await executeRequest(localTarget, options, headers)
    return handleResponse(res, url, options)
  }

  // 3. Worker or long-running maintenance jobs ALWAYS target Render directly
  if (isWorkerRoute(url)) {
    const renderTarget = `${RENDER_BASE_URL}${url}`
    const res = await executeRequest(renderTarget, options, headers)
    return handleResponse(res, url, options)
  }

  // 4. General Stateless API Route: Determine primary and failover targets
  // Check probe health periodically in the background only if Vercel endpoint is configured
  if (VERCEL_BASE_URL) {
    probeVercelHealth().catch(() => {})
  }

  const primaryHost = (isVercelHealthy && VERCEL_BASE_URL) ? VERCEL_BASE_URL : RENDER_BASE_URL
  const failoverHost = (primaryHost === VERCEL_BASE_URL) ? RENDER_BASE_URL : null
  const primaryTimeout = (primaryHost === VERCEL_BASE_URL) ? VERCEL_REQUEST_TIMEOUT_MS : null

  let res = null
  let networkError = null

  try {
    res = await executeRequest(`${primaryHost}${url}`, options, headers, primaryTimeout)
  } catch (err) {
    networkError = err
  }

  // Check if primary host request failed and warrants automatic failover
  // Status codes: 402 (Payment/Disabled), 404 (Not Found), 408 (Timeout), 502/503/504 (Server error / Gateway down)
  const isFailoverCandidate = Boolean(
    networkError ||
    (res && (res.status === 402 || res.status === 404 || res.status === 408 || res.status === 502 || res.status === 503 || res.status === 504))
  )

  if (isFailoverCandidate && failoverHost) {
    // Trip circuit breaker and enforce cooldown
    isVercelHealthy = false
    lastVercelProbe = Date.now() + VERCEL_COOLDOWN_MS - VERCEL_PROBE_INTERVAL_MS
    console.warn(`[Hybrid Router] Primary gateway error (${networkError ? networkError.message : res.status}). Seamlessly executing via Render backup host...`)

    try {
      res = await executeRequest(`${failoverHost}${url}`, options, headers, null)
      networkError = null
    } catch (fallbackErr) {
      networkError = fallbackErr
    }
  }

  if (networkError) {
    throw new Error(`Network failure connecting to API: ${networkError.message}`)
  }

  return handleResponse(res, url, options)
}

// ── Convenience HTTP Methods Attached Directly to apiClient Function ─────────
apiClient.get = (url, options = {}) => apiClient(url, { ...options, method: 'GET' })

apiClient.post = (url, body, options = {}) => {
  const isString = typeof body === 'string'
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  return apiClient(url, {
    ...options,
    method: 'POST',
    body: isString || isFormData || body === undefined ? body : JSON.stringify(body),
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  })
}

apiClient.put = (url, body, options = {}) => {
  const isString = typeof body === 'string'
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  return apiClient(url, {
    ...options,
    method: 'PUT',
    body: isString || isFormData || body === undefined ? body : JSON.stringify(body),
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  })
}

apiClient.patch = (url, body, options = {}) => {
  const isString = typeof body === 'string'
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  return apiClient(url, {
    ...options,
    method: 'PATCH',
    body: isString || isFormData || body === undefined ? body : JSON.stringify(body),
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  })
}

apiClient.delete = (url, options = {}) => apiClient(url, { ...options, method: 'DELETE' })

export default apiClient

async function handleResponse(res, url, options) {
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
