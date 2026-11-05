import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDashboardOverview } from '../services/dashboardService'

const DASHBOARD_CACHE_KEY = 'stockwatch:dashboard_overview'
const AUTO_POLL_INTERVAL_MS = 60000 // 60 seconds background revalidation
const MIN_REVALIDATE_GAP_MS = 25000 // Minimum 25s gap between visibility/focus revalidations

/**
 * useDashboardOverview
 * Fetches and manages the dashboard overview state with instant SWR (Stale-While-Revalidate) caching.
 * - Instant 0ms initial render from cache
 * - Background revalidation on mount
 * - Automated 60-second silent revalidation (keeps FII/DII, filings & indices live without user interaction)
 * - Auto-fetch on tab focus & visibility recovery
 * - Manual refresh via returned `refresh()` function
 * - Tracks per-widget loading and error states from backend partial-failure model
 */
export function useDashboardOverview() {
  const [data, setData] = useState(() => {
    try {
      const cached = sessionStorage.getItem(DASHBOARD_CACHE_KEY) || localStorage.getItem(DASHBOARD_CACHE_KEY)
      if (cached) return JSON.parse(cached)
    } catch {
      // ignore JSON parse error
    }
    return null
  })

  const [loading, setLoading]         = useState(() => !data)
  const [error, setError]             = useState(null)
  const [lastUpdated, setLastUpdated] = useState(() => data ? new Date() : null)
  const [refreshing, setRefreshing]   = useState(false)
  const isMounted = useRef(true)
  const lastFetchTimeRef = useRef(Date.now())
  const hasDataRef = useRef(Boolean(data))

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const load = useCallback(async (isRefresh = false, isSilent = false) => {
    if (isRefresh && !isSilent) {
      setRefreshing(true)
    } else if (!hasDataRef.current && !isSilent) {
      setLoading(true)
    }
    setError(null)

    try {
      const overview = await fetchDashboardOverview()
      if (!isMounted.current) return
      setData(overview)
      hasDataRef.current = true
      setLastUpdated(new Date())
      lastFetchTimeRef.current = Date.now()

      // Update instant local caches
      try {
        const serialized = JSON.stringify(overview)
        sessionStorage.setItem(DASHBOARD_CACHE_KEY, serialized)
        localStorage.setItem(DASHBOARD_CACHE_KEY, serialized)
      } catch {}
    } catch (err) {
      if (!isMounted.current) return
      setError(err.message || 'Failed to load dashboard')
    } finally {
      if (!isMounted.current) return
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load + periodic 60s background revalidation + visibility/focus recovery
  useEffect(() => {
    load()

    const pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        load(true, true) // Silent background refresh
      }
    }, AUTO_POLL_INTERVAL_MS)

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastFetchTimeRef.current
        if (elapsed >= MIN_REVALIDATE_GAP_MS) {
          load(true, true) // Silent revalidation on returning to tab
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)

    return () => {
      clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
    }
  }, [load])

  const refresh = useCallback(() => load(true, false), [load])

  // Convenience: check if a specific source failed in the partial-failure model
  const sourceStatus = useCallback((key) => {
    if (!data?.sources) return 'loading'
    return data.sources[key]?.status || 'unknown'
  }, [data])

  return {
    data,
    loading,
    error,
    refreshing,
    lastUpdated,
    refresh,
    sourceStatus,
  }
}

