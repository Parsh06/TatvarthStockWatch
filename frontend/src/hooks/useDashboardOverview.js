import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDashboardOverview } from '../services/dashboardService'

/**
 * useDashboardOverview
 * Fetches and manages the dashboard overview state.
 * - Initial load on mount
 * - Manual refresh via returned `refresh()` function
 * - Tracks per-widget loading and error states from backend partial-failure model
 */
export function useDashboardOverview() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing, setRefreshing]   = useState(false)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const overview = await fetchDashboardOverview()
      if (!isMounted.current) return
      setData(overview)
      setLastUpdated(new Date())
    } catch (err) {
      if (!isMounted.current) return
      setError(err.message || 'Failed to load dashboard')
    } finally {
      if (!isMounted.current) return
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

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
