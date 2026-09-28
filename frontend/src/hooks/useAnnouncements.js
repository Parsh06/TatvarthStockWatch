import { useState, useCallback, useEffect, useMemo } from 'react'
import { getAnnouncementsFromDB } from '../services/announcementService'
import { apiClient } from '../services/apiClient'
import { auth, FIREBASE_ENABLED } from '../services/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useCronStatus } from './useCronStatus'

const LOCAL_MODE = !FIREBASE_ENABLED

function cleanNormalizedName(str) {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\b(ltd|limited|co|company|corp|corporation|inc|incorporated|pvt|private|india|ind)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function useAnnouncements({ watchlist = [], autoFetch = true } = {}) {
  const { currentUser, loading: authLoading } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)
  const [lastFetched, setLastFetched]     = useState(null)
  const [source, setSource]               = useState(null) // 'local' | 'db' | 'proxy'
  const cronStatus                        = useCronStatus()

  // Pre-process watchlist items for ultra-fast matching
  const watchlistMatchers = useMemo(() => {
    const codes = new Set()
    const symbols = new Set()
    const rawNames = new Set()
    const normNames = new Set()

    watchlist.forEach((s) => {
      const code = (s.bseCode || s.ltdCode || s.scripCode || s.scriptCode || s.code || '').toString().trim()
      if (code) codes.add(code)

      const sym = (s.nseSymbol || s.symbol || s.shortName || '').toString().trim().toUpperCase()
      if (sym) symbols.add(sym)

      const name = (s.scriptName || s.name || s.companyName || '').toString().trim().toLowerCase()
      if (name) {
        rawNames.add(name)
        const norm = cleanNormalizedName(name)
        if (norm) normNames.add(norm)
      }
    })

    return { codes, symbols, rawNames, normNames }
  }, [watchlist])

  const fetch = useCallback(async (opts = {}) => {
    if (FIREBASE_ENABLED && !auth?.currentUser) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (LOCAL_MODE) {
        const params = new URLSearchParams()
        if (opts.exchange && opts.exchange !== 'ALL') params.set('exchange', opts.exchange)
        if (opts.scripCode) params.set('scriptCode', opts.scripCode)

        const res  = await apiClient(`/api/announcements?${params.toString()}`)
        const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
        setAnnouncements(data)
        setSource('local')
        setLastFetched(new Date())
        return
      }

      // Extract scripCode if search is a 6-digit number
      let extractedCode = opts.scripCode
      if (!extractedCode && opts.search && /^\d{6}$/.test(opts.search.trim())) {
        extractedCode = opts.search.trim()
      }

      const hasCustomFilters = Boolean(opts.fromDate || opts.toDate || extractedCode)

      if (hasCustomFilters) {
        const params = new URLSearchParams()
        if (opts.fromDate) params.set('fromDate', opts.fromDate)
        if (opts.toDate) params.set('toDate', opts.toDate)
        if (extractedCode) params.set('scripCode', extractedCode)
        
        const res = await apiClient(`/api/bse/announcements/proxy?${params.toString()}`)
        const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
        setAnnouncements(data)
        setSource('proxy')
      } else {
        // Production mode: Default to MongoDB for "today" (auto-fetches if empty or on refresh)
        let data = await getAnnouncementsFromDB({
          exchange:   opts.exchange,
          scripCode:  opts.scripCode,
          limitCount: opts.limitCount || 2000,
          refresh:    Boolean(opts.refresh),
        })

        // Fallback to proxy if still empty
        if (!Array.isArray(data) || data.length === 0) {
          try {
            const proxyRes = await apiClient('/api/bse/announcements/proxy')
            if (Array.isArray(proxyRes?.data) && proxyRes.data.length > 0) {
              data = proxyRes.data
              setSource('proxy')
            }
          } catch (proxyErr) {
            console.warn('[useAnnouncements] Proxy fallback failed:', proxyErr)
          }
        } else {
          setSource('db')
        }

        setAnnouncements(Array.isArray(data) ? data : [])
      }
      
      setLastFetched(new Date())
    } catch (err) {
      console.error('[useAnnouncements] Fetch failed:', err.message)
      setError(err.message)
      setAnnouncements([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoFetch && !authLoading && (!FIREBASE_ENABLED || currentUser)) {
      fetch()
    }
  }, [autoFetch, authLoading, currentUser, fetch, cronStatus?.lastRun]) 

  // Dynamically compute watchlisted status during render
  const annotatedAnnouncements = useMemo(() => {
    const { codes, symbols, rawNames, normNames } = watchlistMatchers

    return announcements.map((a) => {
      const annCode = (a.scriptCode || a.scripCode || a.bseCode || a.ltdCode || '').toString().trim()
      const annSymbol = (a.nseSymbol || a.symbol || a.shortName || '').toString().trim().toUpperCase()
      const rawAnnName = (a.scriptName || a.companyName || '').toString().trim().toLowerCase()
      const normAnnName = cleanNormalizedName(rawAnnName)

      let isWatchlisted = false

      // 1. Direct code match (e.g. BSE Scrip code 522005)
      if (annCode && codes.has(annCode)) {
        isWatchlisted = true
      }
      // 2. Direct symbol match (e.g. NSE symbol AUSTINENG)
      else if (annSymbol && symbols.has(annSymbol)) {
        isWatchlisted = true
      }
      // 3. Check if scriptCode is an alphabetic NSE symbol
      else if (annCode && symbols.has(annCode.toUpperCase())) {
        isWatchlisted = true
      }
      // 4. Exact raw company name match
      else if (rawAnnName && rawNames.has(rawAnnName)) {
        isWatchlisted = true
      }
      // 5. Normalized exact company name match
      else if (normAnnName && normNames.has(normAnnName)) {
        isWatchlisted = true
      }

      return {
        ...a,
        isWatchlisted,
      }
    })
  }, [announcements, watchlistMatchers])

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

