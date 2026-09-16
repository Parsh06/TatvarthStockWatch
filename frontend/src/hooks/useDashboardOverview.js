import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDashboardOverview } from '../services/dashboardService'

const DASHBOARD_CACHE_KEY = 'stockwatch:dashboard_overview'

/**
 * useDashboardOverview
 * Fetches and manages the dashboard overview state with instant SWR (Stale-While-Revalidate) caching.
 * - Instant 0ms initial render from cache
 * - Background revalidation on mount
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

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else if (!data) {
      setLoading(true)
    }
    setError(null)

    try {
      const overview = await fetchDashboardOverview()
      if (!isMounted.current) return
      setData(overview)
      setLastUpdated(new Date())

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
  }, [data])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(() => load(true), [load])

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

