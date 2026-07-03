import { useState, useMemo } from 'react'
import {
  Newspaper, Search, FileText, ExternalLink, RefreshCw,
  AlertCircle, X, Calendar, ChevronRight, Building2, Info, Clock,
} from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import ScriptSearchInput from '../Common/ScriptSearchInput'

// ── helpers ───────────────────────────────────────────────────────────────────
function parseBseDate(str) {
  if (!str) return null
  // "18/06/2026 14:30:00" or "18/06/2026"
  const [datePart] = str.split(' ')
  const [d, m, y] = datePart.split('/')
  return d && m && y ? new Date(`${y}-${m}-${d}`) : null
}

function fmtDate(str) {
  const d = parseBseDate(str)
  if (!d || isNaN(d)) return str || ''
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function itemDate(item) {
  // Returns a Date object from item, or null
  if (item.date) return parseBseDate(item.date)
  if (item.announcementDate) return new Date(item.announcementDate)
  return null
}

function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// Time filter options
const TIME_FILTERS = [
  { label: 'Today',    value: 'today',   days: 1  },
  { label: '7 Days',   value: '7d',      days: 7  },
  { label: '1 Month',  value: '1m',      days: 30 },
  { label: '3 Months', value: '3m',      days: 90 },
  { label: '6 Months', value: '6m',      days: 180 },
  { label: '1 Year',   value: '1y',      days: 365 },
  { label: 'All Time', value: 'all',     days: null },
]

function applyTimeFilter(items, value) {
  const tf = TIME_FILTERS.find((t) => t.value === value)
  if (!tf || !tf.days) return items
  const cutoff = Date.now() - tf.days * 86400000
  return items.filter((item) => {
    const d = itemDate(item)
    return d && d.getTime() >= cutoff
  })
}

// Classify a BSE subject line into a short tag
function newsTag(subject) {
  const s = (subject || '').toLowerCase()
  if (s.includes('result') || s.includes('financial'))      return { label: 'Results',      color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', bar: 'bg-emerald-500' }
  if (s.includes('board meeting') || s.includes('board'))   return { label: 'Board Meeting', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30',           bar: 'bg-blue-500'   }
  if (s.includes('dividend') || s.includes('bonus'))        return { label: 'Dividend',      color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',         bar: 'bg-amber-500'  }
  if (s.includes('agm') || s.includes('egm'))               return { label: 'AGM/EGM',       color: 'bg-orange-500/15 text-orange-300 border-orange-500/30',      bar: 'bg-orange-500' }
  if (s.includes('insider') || s.includes('trading'))       return { label: 'Insider',        color: 'bg-red-500/15 text-red-300 border-red-500/30',               bar: 'bg-red-500'    }
  if (s.includes('analyst') || s.includes('investor meet')) return { label: 'Analyst Meet',  color: 'bg-violet-500/15 text-violet-300 border-violet-500/30',      bar: 'bg-violet-500' }
  if (s.includes('regulation 30') || s.includes('lodr'))    return { label: 'Regulation 30', color: 'bg-slate-500/15 text-slate-300 border-slate-500/30',         bar: 'bg-slate-400'  }
  if (s.includes('acquisition') || s.includes('merger'))    return { label: 'M&A',            color: 'bg-pink-500/15 text-pink-300 border-pink-500/30',            bar: 'bg-pink-500'   }
  if (s.includes('ipo') || s.includes('listing'))           return { label: 'IPO/Listing',   color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',            bar: 'bg-cyan-500'   }
  return { label: 'Filing', color: 'bg-primary/15 text-primary border-primary/30', bar: 'bg-primary/60' }
}

// ── subcomponents ─────────────────────────────────────────────────────────────
function NewsItem({ item }) {
  const tag     = newsTag(item.subject)
  const subject = item.subject || '—'
  const d       = itemDate(item)
  const pdfUrl  = item.pdfUrl
  const bseUrl  = item.bseUrl

  return (
    <div className="group flex gap-3 bg-surface border border-border rounded-xl p-4 hover:border-primary/40 transition-all duration-200">
      <div className={clsx('w-1 rounded-full flex-shrink-0 self-stretch', tag.bar)} />

      <div className="flex-1 min-w-0">
        {/* Badges row */}
        <div className="flex items-center flex-wrap gap-1.5 mb-2">
          <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border', tag.color)}>
            {tag.label}
          </span>
          {d && (
            <span className="flex items-center gap-1 text-[10px] text-textMuted">
              <Calendar className="w-2.5 h-2.5" />
              {fmtDate(item.date) || d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
          {d && (
            <span className="text-[10px] text-textMuted opacity-50">{timeAgo(d)}</span>
          )}
        </div>

        {/* Subject */}
        <p className="text-sm font-medium text-textPrimary leading-snug line-clamp-3 mb-2.5">
          {subject}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-textMuted hover:text-primary transition px-2.5 py-1 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5"
            >
              <FileText className="w-3.5 h-3.5" />
              View PDF
            </a>
          )}
          {bseUrl && (
            <a
              href={bseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-textMuted hover:text-primary transition px-2.5 py-1 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              BSE
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function SkeletonItem() {
  return (
    <div className="flex gap-3 bg-surface border border-border rounded-xl p-4 animate-pulse">
      <div className="w-1 rounded-full bg-border self-stretch min-h-[60px]" />
      <div className="flex-1 space-y-2.5">
        <div className="flex gap-1.5">
          <div className="h-4 w-20 bg-border rounded-full" />
          <div className="h-4 w-28 bg-border rounded-full" />
        </div>
        <div className="h-4 w-full bg-border rounded" />
        <div className="h-4 w-3/4 bg-border rounded" />
        <div className="flex gap-2 mt-1">
          <div className="h-6 w-20 bg-border rounded-lg" />
          <div className="h-6 w-16 bg-border rounded-lg" />
        </div>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 30

export default function NewsPage() {
  const [selectedScript, setSelectedScript] = useState(null)
  const [companyNews,    setCompanyNews]    = useState([])
  const [loadingCompany, setLoadingCompany] = useState(false)
  const [companyError,   setCompanyError]   = useState(null)

  // Filters
  const [search,     setSearch]     = useState('')
  const [tagFilter,  setTagFilter]  = useState('')
  const [timeFilter, setTimeFilter] = useState('all')
  const [page,       setPage]       = useState(1)

  function resetFilters() {
    setSearch('')
    setTagFilter('')
    setTimeFilter('all')
    setPage(1)
  }

  async function fetchCompanyNews(item) {
    setSelectedScript(item)
    setCompanyNews([])
    setCompanyError(null)
    resetFilters()
    if (!item) return
    setLoadingCompany(true)
    try {
      const data = await apiClient(`/api/bse/companynews?code=${item.bseCode}`)
      setCompanyNews(data.items || [])
    } catch (e) {
      setCompanyError(e.message)
    } finally {
      setLoadingCompany(false)
    }
  }

  function clearCompany() {
    setSelectedScript(null)
    setCompanyNews([])
    setCompanyError(null)
    resetFilters()
  }

  const isCompanyMode = Boolean(selectedScript)
  const baseItems = isCompanyMode ? companyNews : []

  // Apply time filter first, then derive tag counts from that subset
  const timeFiltered = useMemo(() => applyTimeFilter(baseItems, timeFilter), [baseItems, timeFilter])

  const availableTags = useMemo(() => {
    const counts = {}
    for (const item of timeFiltered) {
      const t = newsTag(item.subject).label
      counts[t] = (counts[t] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [timeFiltered])

  const filtered = useMemo(() => {
    let list = timeFiltered
    if (tagFilter) list = list.filter((i) => newsTag(i.subject).label === tagFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((i) => i.subject.toLowerCase().includes(q))
    }
    return list
  }, [timeFiltered, tagFilter, search])

  const paginated = filtered.slice(0, page * PAGE_SIZE)
  const hasMore   = paginated.length < filtered.length

  const activeFilterCount = [tagFilter, search, timeFilter !== 'all' ? timeFilter : ''].filter(Boolean).length

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold text-textPrimary flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary/15 rounded-lg flex items-center justify-center">
            <Newspaper className="w-4 h-4 text-primary" />
          </div>
          Market News
        </h1>
        <p className="text-sm text-textMuted mt-0.5 ml-10.5">
          {isCompanyMode
            ? `Latest BSE filings for ${selectedScript.scripName}`
            : 'Search a company to view its BSE filings'}
        </p>
      </div>

      {/* ── Company search card ── */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-textPrimary">Search Company News</span>
        </div>

        {selectedScript ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-primary/8 border border-primary/25 rounded-xl">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-textPrimary truncate">{selectedScript.scripName}</p>
                <p className="text-xs text-textMuted">
                  BSE: {selectedScript.bseCode}
                  {selectedScript.symbol ? ` · NSE: ${selectedScript.symbol}` : ''}
                  {!loadingCompany && companyNews.length > 0 && (
                    <span className="ml-2 text-primary">{companyNews.length} filings</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!loadingCompany && (
                <button
                  onClick={() => fetchCompanyNews(selectedScript)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg transition"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              )}
              <button
                onClick={clearCompany}
                className="p-1.5 text-textMuted hover:text-danger hover:bg-danger/10 rounded-lg transition"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1">
            <ScriptSearchInput
              placeholder="Type company name or BSE/NSE code…"
              onSelect={(item) => item && fetchCompanyNews(item)}
              onClear={clearCompany}
            />
          </div>
        )}

        {!isCompanyMode && (
          <p className="flex items-center gap-1.5 text-xs text-textMuted">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Search a company above to see its specific BSE filings and announcements.
          </p>
        )}
      </div>

      {/* ── Error ── */}
      {companyError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-danger/10 border border-danger/30 rounded-xl text-sm text-danger">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {companyError}
        </div>
      )}

      {/* ── Filters bar (only when data is loaded) ── */}
      {!loadingCompany && baseItems.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-4">

          {/* Time filter */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Clock className="w-3.5 h-3.5 text-textMuted" />
              <span className="text-xs font-semibold text-textMuted uppercase tracking-wider">Time Period</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TIME_FILTERS.map((tf) => {
                const count = applyTimeFilter(baseItems, tf.value).length
                return (
                  <button
                    key={tf.value}
                    onClick={() => { setTimeFilter(tf.value); setTagFilter(''); setPage(1) }}
                    className={clsx(
                      'text-xs px-3 py-1.5 rounded-lg border transition font-medium',
                      timeFilter === tf.value
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'border-border text-textMuted hover:border-primary/30 hover:text-textPrimary'
                    )}
                  >
                    {tf.label}
                    <span className={clsx('ml-1.5 opacity-60', timeFilter === tf.value && 'opacity-80')}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category filter */}
          {availableTags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Newspaper className="w-3.5 h-3.5 text-textMuted" />
                <span className="text-xs font-semibold text-textMuted uppercase tracking-wider">Category</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => { setTagFilter(''); setPage(1) }}
                  className={clsx(
                    'text-xs px-3 py-1.5 rounded-lg border transition font-medium',
                    !tagFilter
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-textMuted hover:border-primary/30 hover:text-textPrimary'
                  )}
                >
                  All <span className="ml-1 opacity-60">{timeFiltered.length}</span>
                </button>
                {availableTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    onClick={() => { setTagFilter((t) => t === tag ? '' : tag); setPage(1) }}
                    className={clsx(
                      'text-xs px-3 py-1.5 rounded-lg border transition font-medium',
                      tagFilter === tag
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'border-border text-textMuted hover:border-primary/30 hover:text-textPrimary'
                    )}
                  >
                    {tag} <span className="ml-1 opacity-60">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder={`Search within ${selectedScript?.scripName || ''} filings…`}
              className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted focus:outline-none focus:border-primary/60 transition"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Active filter summary + clear */}
          {activeFilterCount > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-textMuted">
                <span className="text-textPrimary font-medium">{filtered.length}</span> filing{filtered.length !== 1 ? 's' : ''}
                {timeFilter !== 'all' && <span> · <span className="text-primary">{TIME_FILTERS.find(t => t.value === timeFilter)?.label}</span></span>}
                {tagFilter && <span> · <span className="text-primary">{tagFilter}</span></span>}
                {search && <span> matching <span className="text-primary">"{search}"</span></span>}
              </p>
              <button
                onClick={() => { setTagFilter(''); setSearch(''); setTimeFilter('all'); setPage(1) }}
                className="text-xs text-textMuted hover:text-danger transition flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loadingCompany && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-textMuted animate-pulse px-1">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading filings for {selectedScript?.scripName}…
          </div>
          {[...Array(6)].map((_, i) => <SkeletonItem key={i} />)}
        </div>
      )}

      {/* ── News list ── */}
      {!loadingCompany && (
        !isCompanyMode ? (
          /* Empty / prompt state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
              <Newspaper className="w-8 h-8 text-primary/30" />
            </div>
            <p className="text-textPrimary font-semibold text-base mb-1">Search for a company</p>
            <p className="text-sm text-textMuted max-w-xs">
              Type a company name or BSE/NSE code above to view its latest filings and announcements from BSE India.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-3">
              <Search className="w-6 h-6 text-primary/40" />
            </div>
            <p className="text-textPrimary font-semibold mb-1">No filings match your filters</p>
            <p className="text-sm text-textMuted">Try a different time period or category.</p>
            <button
              onClick={() => { setTagFilter(''); setSearch(''); setTimeFilter('all'); setPage(1) }}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {paginated.map((item, i) => (
              <NewsItem key={item.id || i} item={item} />
            ))}
            {hasMore && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-2 mx-auto px-6 py-2.5 border border-border text-sm text-textMuted hover:text-textPrimary hover:border-primary/40 rounded-xl transition"
                >
                  Load more
                  <span className="opacity-60">({filtered.length - paginated.length} remaining)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}
