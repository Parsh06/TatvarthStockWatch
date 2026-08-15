import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import { useWatchlist } from './WatchlistContext'
import { useAnnouncements } from '../hooks/useAnnouncements'

const AnnouncementsContext = createContext()

const ANN_READ_KEY = 'ann_read_v1'

function loadReadSet() {
  try { return new Set(JSON.parse(localStorage.getItem(ANN_READ_KEY) || '[]')) }
  catch { return new Set() }
}

function saveReadSet(s) {
  try { localStorage.setItem(ANN_READ_KEY, JSON.stringify([...s])) } catch {}
}

export function AnnouncementsProvider({ children }) {
  const { watchlist } = useWatchlist()
  // Fetch globally using the custom hook
  const { announcements, watchlistedAnnouncements, loading, lastFetched, fetch } = useAnnouncements({ watchlist, autoFetch: true })
  const [readIds, setReadIds] = useState(loadReadSet)

  const unreadCount = useMemo(
    () => watchlistedAnnouncements.filter(a => !readIds.has(a.id)).length,
    [watchlistedAnnouncements, readIds]
  )

  const markRead = useCallback((id) => {
    setReadIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveReadSet(next)
      return next
    })
  }, [])
  
  const markAllRead = useCallback((ids) => {
    setReadIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      saveReadSet(next)
      return next
    })
  }, [])

  return (
    <AnnouncementsContext.Provider value={{
      announcements,
      watchlistedAnnouncements,
      loading,
      lastFetched,
      fetch,
      readIds,
      unreadCount,
      markRead,
      markAllRead
    }}>
      {children}
    </AnnouncementsContext.Provider>
  )
}

export const useGlobalAnnouncements = () => useContext(AnnouncementsContext)
