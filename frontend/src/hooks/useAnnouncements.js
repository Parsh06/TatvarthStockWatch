import { useState, useCallback, useEffect } from 'react'
import { getAnnouncementsFromDB } from '../services/announcementService'
import { FIREBASE_ENABLED } from '../services/firebase'

const LOCAL_MODE = !FIREBASE_ENABLED

export function useAnnouncements({ watchlist = [], autoFetch = true } = {}) {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)
  const [lastFetched, setLastFetched]     = useState(null)
  const [source, setSource]               = useState(null) // 'local' | 'db'

  // BSE announcements have scriptCode = LTD code (numeric)
  // NSE announcements have scriptCode = Symbol (alphabetic)
  const watchlistedLtdCodes = new Set(
    watchlist.map((s) => (s.ltdCode || s.bseCode || '').trim()).filter(Boolean)
  )
  const watchlistedSymbols = new Set(
    watchlist.map((s) => (s.symbol || s.nseSymbol || '').trim().toUpperCase()).filter(Boolean)
  )
  const watchlistedNames = new Set(
    watchlist.map((s) => (s.scriptName || s.name || '').toLowerCase().trim()).filter(Boolean)
  )

  function annotate(list) {
    return list.map((a) => {
      const annCode = (a.scriptCode || a.scripCode || '').trim()
      const annName = (a.scriptName || a.companyName || '').toLowerCase().trim()
      return {
        ...a,
        isWatchlisted:
          watchlistedLtdCodes.has(annCode) ||
          watchlistedSymbols.has(annCode.toUpperCase()) ||
          watchlistedNames.has(annName),
      }
    })
  }

  const fetch = useCallback(async (opts = {}) => {
    setLoading(true)
    setError(null)

    try {
      if (LOCAL_MODE) {
        // Local mode: read from /api/announcements (populated by Fetch News trigger)
        const params = new URLSearchParams()
        if (opts.exchange && opts.exchange !== 'ALL') params.set('exchange', opts.exchange)
        if (opts.scripCode) params.set('scriptCode', opts.scripCode)

        const res  = await window.fetch(`/api/announcements?${params.toString()}`)
        const json = await res.json()
        const data = Array.isArray(json.data) ? json.data : []

        setAnnouncements(data)
        setSource('local')
        setLastFetched(new Date())
        return
      }

      // Production mode: Firestore
      const data = await getAnnouncementsFromDB({
        exchange:   opts.exchange,
        scripCode:  opts.scripCode,
        limitCount: 200,
      })
      setAnnouncements(data)
      setSource('db')
      setLastFetched(new Date())
    } catch (err) {
      console.error('[useAnnouncements] Fetch failed:', err.message)
      setError(err.message)
      setAnnouncements([])
    } finally {
      setLoading(false)
    }
  }, [watchlist]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoFetch) fetch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamically compute watchlisted status during render to avoid stale closures
  const annotatedAnnouncements = announcements.map((a) => {
    const annCode = (a.scriptCode || a.scripCode || '').trim()
    const annName = (a.scriptName || a.companyName || '').toLowerCase().trim()
    return {
      ...a,
      isWatchlisted:
        watchlistedLtdCodes.has(annCode) ||
        watchlistedSymbols.has(annCode.toUpperCase()) ||
        watchlistedNames.has(annName),
    }
  })

  return {
    announcements: annotatedAnnouncements,
    watchlistedAnnouncements: annotatedAnnouncements.filter((a) => a.isWatchlisted),
    loading,
    error,
    lastFetched,
    source,
    fetch,
  }
}
