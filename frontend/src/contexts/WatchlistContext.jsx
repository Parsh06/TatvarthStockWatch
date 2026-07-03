import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from './AuthContext'
import {
  getWatchlist,
  addScript as addScriptService,
  removeScript as removeScriptService,
  bulkAddScripts as bulkAddService,
  clearWatchlist as clearWatchlistService,
} from '../services/watchlistService'

const WatchlistContext = createContext({
  watchlist:    [],
  loading:      true,
  addScript:    async () => {},
  removeScript: async () => {},
  bulkAdd:      async () => {},
  clearWatchlist: async () => {},
  refresh:      async () => {},
})

export function WatchlistProvider({ children }) {
  const { currentUser } = useAuth()
  const [watchlist, setWatchlist] = useState([])
  const [loading, setLoading]     = useState(false)

  const refresh = useCallback(async () => {
    if (!currentUser) return
    setLoading(true)
    try {
      const data = await getWatchlist(currentUser.uid)
      setWatchlist(data)
    } catch (e) {
      console.error('[Watchlist] Failed to load:', e.message)
      setWatchlist([])
    } finally {
      setLoading(false)
    }
  }, [currentUser])

  useEffect(() => {
    if (currentUser) {
      refresh()
    } else {
      setWatchlist([])
    }
  }, [currentUser])

  const addScript = useCallback(async (scriptData) => {
    if (!currentUser) return
    const result = await addScriptService(currentUser.uid, scriptData)
    if (result?.alreadyExists) return result
    await refresh()
    return result
  }, [currentUser, refresh])

  const removeScript = useCallback(async (docId) => {
    if (!currentUser) return
    await removeScriptService(currentUser.uid, docId)
    setWatchlist((prev) => prev.filter((s) => s.id !== docId))
  }, [currentUser])

  const bulkAdd = useCallback(async (scripts) => {
    if (!currentUser) return { added: 0, skipped: 0 }
    const result = await bulkAddService(currentUser.uid, scripts)
    await refresh()
    return result
  }, [currentUser, refresh])

  const clearWatchlist = useCallback(async () => {
    if (!currentUser) return
    await clearWatchlistService(currentUser.uid)
    setWatchlist([])
  }, [currentUser])

  // Stable object reference — consumers only re-render when watchlist or loading actually changes
  const value = useMemo(() => ({
    watchlist, loading, usingMock: false, addScript, removeScript, bulkAdd, clearWatchlist, refresh
  }), [watchlist, loading, addScript, removeScript, bulkAdd, clearWatchlist, refresh])

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  )
}

export function useWatchlist() {
  return useContext(WatchlistContext)
}
