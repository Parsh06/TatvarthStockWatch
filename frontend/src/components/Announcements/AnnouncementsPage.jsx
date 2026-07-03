import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, Download, Bell, Zap, FileSpreadsheet, CheckCheck } from 'lucide-react'
import clsx from 'clsx'
import { useAnnouncements } from '../../hooks/useAnnouncements'
import { useWatchlist } from '../../contexts/WatchlistContext'
import AnnouncementCard from './AnnouncementCard'
import AnnouncementFilters from './AnnouncementFilters'
import EmptyState from '../Common/EmptyState'
import { SkeletonAnnouncementCard } from '../Common/Loader'
import { exportToXLSX } from '../../utils/csvParser'
import { formatRelativeDate } from '../../utils/formatters'

const PAGE_SIZE    = 20
const ANN_READ_KEY = 'ann_read_v1'

function loadReadSet() {
  try { return new Set(JSON.parse(localStorage.getItem(ANN_READ_KEY) || '[]')) }
  catch { return new Set() }
}
function saveReadSet(s) {
  try { localStorage.setItem(ANN_READ_KEY, JSON.stringify([...s])) } catch {}
}

export default function AnnouncementsPage() {
  const [searchParams] = useSearchParams()
  const { watchlist }  = useWatchlist()
  const { announcements, loading, lastFetched, fetch } = useAnnouncements({ watchlist, autoFetch: true })
  const [page, setPage]       = useState(1)
  const [readIds, setReadIds] = useState(loadReadSet)
  const [filters, setFilters] = useState({
    exchange: searchParams.get('exchange') || '',
    category: '',
    fromDate: '',
    toDate:   '',
    search:   searchParams.get('script')   || '',
  })

  // Only show watchlist-matched announcements
  const watchlistOnly = announcements.filter((a) => a.isWatchlisted)

  const filtered = useMemo(() => {
    let list = watchlistOnly
    if (filters.search) {
      const s = filters.search.toLowerCase()
      list = list.filter((a) =>
        (a.scriptName || a.companyName || '').toLowerCase().includes(s) ||
        (a.scriptCode || a.scripCode   || '').toLowerCase().includes(s) ||
        (a.subject    || a.headline    || '').toLowerCase().includes(s)
      )
    }
    if (filters.exchange) list = list.filter((a) => a.exchange === filters.exchange)
    if (filters.category) list = list.filter((a) => {
      const cat = (a.category || '').toLowerCase()
      const target = filters.category.toLowerCase()
      return cat === target || cat.includes(target) || target.includes(cat)
    })
    if (filters.fromDate) list = list.filter((a) => (a.announcementDate || '') >= filters.fromDate)
    if (filters.toDate)   list = list.filter((a) => (a.announcementDate || '') <= filters.toDate + 'T23:59:59')
    return list
  }, [announcements, filters])

  // Category counts from ALL watchlist announcements (before filtering by category)
  const categoryCounts = useMemo(() => {
    const counts = {}
    let base = watchlistOnly
    if (filters.search) {
      const s = filters.search.toLowerCase()
      base = base.filter((a) =>
        (a.scriptName || a.companyName || '').toLowerCase().includes(s) ||
        (a.scriptCode || a.scripCode   || '').toLowerCase().includes(s) ||
        (a.subject    || a.headline    || '').toLowerCase().includes(s)
      )
    }
    if (filters.exchange) base = base.filter((a) => a.exchange === filters.exchange)
    for (const a of base) {
      const cat = (a.category || 'Other').trim()
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [announcements, filters.search, filters.exchange])

  const paginated = filtered.slice(0, page * PAGE_SIZE)
  const hasMore   = paginated.length < filtered.length

  function handleFilterChange(f) { setFilters(f); setPage(1) }

  const unreadCount = useMemo(
    () => filtered.filter(a => !readIds.has(a.id)).length,
    [filtered, readIds]
  )

  const markRead = useCallback((id) => {
    setReadIds(prev => {
      const next = new Set(prev); next.add(id); saveReadSet(next); return next
    })
  }, [])

  function markAllRead() {
    const next = new Set(readIds)
    filtered.forEach(a => next.add(a.id))
    saveReadSet(next); setReadIds(next)
  }

  const today = new Date().toISOString().slice(0, 10)
  function handleExport() {
    exportToXLSX(filtered, `announcements_${today}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-textPrimary">My Announcements</h1>
          {filtered.length > 0 && (
            <span className="px-2.5 py-1 bg-primary/15 text-primary text-xs font-medium rounded-full">
              {filtered.length}
            </span>
          )}
          {unreadCount > 0 && (
            <span className="px-2.5 py-1 bg-red-500/15 text-red-400 text-xs font-semibold rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs text-textMuted hover:text-textPrimary hover:border-primary/40 transition">
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          )}
          {lastFetched && (
            <span className="text-xs text-textMuted">Updated {formatRelativeDate(lastFetched)}</span>
          )}
          <button
            onClick={() => fetch(filters)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={!filtered.length}
            className="flex items-center gap-2 px-4 py-2 border border-border text-textMuted hover:text-emerald-400 hover:border-emerald-500/50 disabled:opacity-40 rounded-lg text-sm font-medium transition"
            title="Download as Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* Hint before first trigger */}
      {!loading && announcements.length === 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/10 border border-primary/30 rounded-xl text-sm text-primary">
          <Zap className="w-4 h-4 flex-shrink-0" />
          <span>
            No announcements yet — go to <strong>Watchlist</strong> and click <strong>Fetch News</strong> to load today's announcements.
          </span>
        </div>
      )}

      {/* Filters */}
      <AnnouncementFilters
        filters={filters}
        onChange={handleFilterChange}
        categoryCounts={categoryCounts}
      />

      {/* Count summary */}
      {!loading && announcements.length > 0 && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-textMuted">
            Showing <span className="text-textPrimary font-medium">{filtered.length}</span> announcement{filtered.length !== 1 ? 's' : ''}
            {filters.category && <> in <span className="text-primary font-medium">{filters.category}</span></>}
            {filters.exchange  && <> on <span className="text-primary font-medium">{filters.exchange}</span></>}
          </p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <SkeletonAnnouncementCard key={i} />)}
        </div>
      ) : filtered.length === 0 && announcements.length > 0 ? (
        <EmptyState icon={Bell} title="No matching announcements" subtitle="Try adjusting your filters or clearing the category selection" />
      ) : filtered.length === 0 ? null : (
        <div className="space-y-3">
          {paginated.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              read={readIds.has(a.id)}
              onRead={markRead}
            />
          ))}
          {hasMore && (
            <div className="text-center pt-4">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="px-6 py-2.5 border border-border text-textMuted hover:text-textPrimary hover:border-primary/50 rounded-lg text-sm transition"
              >
                Load more ({filtered.length - paginated.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
