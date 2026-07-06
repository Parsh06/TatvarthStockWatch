import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, Download, Bell, AlertCircle, FileText, ExternalLink, Star, Filter, X, ChevronDown, Info } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { exportToXLSX } from '../../utils/csvParser'
import { getCategoryColor } from '../../utils/formatters'
import { useWatchlist } from '../../contexts/WatchlistContext'
import { getAnnouncementsFromDB } from '../../services/announcementService'
import ScriptSearchInput from '../Common/ScriptSearchInput'
import PageTransition from '../Common/PageTransition'

const getISTDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
const today = () => getISTDate()
const toYYYYMMDD  = (d) => d.replace(/-/g, '')
const PAGE_SIZE   = 50

function dateNDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return getISTDate(d)
}

const QUICK_RANGES = [
  { label: 'Today',    from: today,               to: today },
  { label: '3 Days',   from: () => dateNDaysAgo(2), to: today },
  { label: '1 Week',   from: () => dateNDaysAgo(6), to: today },
  { label: '2 Weeks',  from: () => dateNDaysAgo(13), to: today },
]

// Known BSE announcement categories (shown before results load)
const KNOWN_CATEGORIES = [
  'Board Meeting',
  'Result',
  'AGM/EGM',
  'Insider Trading',
  'Corp. Action',
  'New Listing',
  'Company Update',
  'Analysts/Institutional Investor Meet',
  'Outcome of Board Meeting',
  'Rights Issue',
  'Buyback',
  'Open Offer',
  'Delisting',
  'Dividend',
  'Bonus',
  'Stock Split',
  'Credit Rating',
  'Press Release',
  'Newspaper Publication',
  'Agreements/MOU',
  'Acquisition',
  'Scheme of Arrangement',
  'Change in Management',
  'Change in Director',
  'Financial Results',
  'Others',
]


function StatCard({ label, value, sub, color = 'text-textPrimary', icon: Icon, iconColor }) {
  return (
    <div className="glass-panel border-t-2 border-t-white/10 rounded-2xl p-5 hover:-translate-y-1 transition-transform flex items-center gap-4">
      {Icon && (
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner', iconColor || 'bg-primary/20 text-primary')}>
          <Icon className="w-6 h-6" />
        </div>
      )}
      <div>
        <p className="text-[11px] font-semibold tracking-tight text-textMuted uppercase mb-1">{label}</p>
        <p className={clsx('text-2xl font-bold font-display tabular-nums tracking-tight', color)}>{value}</p>
        {sub && <p className="text-[10px] font-medium text-textMuted mt-0.5 opacity-80">{sub}</p>}
      </div>
    </div>
  )
}

export default function AllAnnouncementsPage() {
  const navigate = useNavigate()
  const { watchlist } = useWatchlist()
  const [fromDate,   setFromDate]   = useState(today())
  const [toDate,     setToDate]     = useState(today())
  const [catFilter,  setCatFilter]  = useState('')
  const [codeFilter, setCodeFilter] = useState('')
  const [codeLabel,  setCodeLabel]  = useState('')
  const [search,     setSearch]     = useState('')
  const [exchange,   setExchange]   = useState('BOTH') // 'BSE', 'NSE', 'BOTH'
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [result,     setResult]     = useState(null)
  const [page,       setPage]       = useState(1)
  const [onlyWatchlist, setOnlyWatchlist] = useState(false)

  const watchlistCodes = useMemo(() =>
    new Set(watchlist.map((s) => s.ltdCode || s.bseCode || '').filter(Boolean)),
    [watchlist]
  )

  function applyQuickRange(r) {
    setFromDate(r.from()); setToDate(r.to()); setResult(null); setError(null)
  }

  async function fetchAnnouncements() {
    if (!fromDate || !toDate) { setError('Select valid From and To dates.'); return }
    if (fromDate > toDate)    { setError('From date must not be after To date.'); return }
    setLoading(true); setError(null); setPage(1); setSearch('')
    try {
      if (fromDate === today() && toDate === today()) {
        // Fetch NSE live first (saves to DB), then read all from DB
        try {
          await apiClient('/api/announcements/fetch-nse', { method: 'POST' })
        } catch (nseErr) {
          console.warn('[AllAnnouncements] NSE fetch failed (non-blocking):', nseErr.message)
        }
        const data = await getAnnouncementsFromDB({ limitCount: 5000 }) // All today's BSE+NSE from DB
        setResult({
          from: fromDate,
          to: toDate,
          total: data.length,
          rawTotal: data.length,
          announcements: data
        })
      } else {
        // Company filtering is done client-side
        const params = new URLSearchParams({ from: toYYYYMMDD(fromDate), to: toYYYYMMDD(toDate) })
        const data = await apiClient(`/api/bse/announcements?${params}`)
        setResult(data)
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // Fetch automatically on mount
  useEffect(() => {
    fetchAnnouncements()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allItems = result?.announcements ?? []

  // Unique categories — scoped to current company if one is selected
  const categoryOptions = useMemo(() => {
    const source = codeFilter
      ? allItems.filter((a) => a.bseCode === codeFilter || a.scriptCode === codeFilter)
      : allItems
    const counts = {}
    for (const a of source) {
      const base = (a.category || 'Other').split(' / ')[0].trim()
      counts[base] = (counts[base] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [allItems, codeFilter])

  const filtered = useMemo(() => {
    let list = allItems
    
    // Date filtering (since DB returns latest N items, we must filter out older ones locally)
    if (fromDate && toDate) {
      const fromTs = new Date(fromDate).getTime()
      // toDate is a date string like 2026-07-05, we add 1 day to make it inclusive
      const toTs = new Date(toDate).getTime() + 86400000 
      list = list.filter((a) => {
        if (!a.announcementDate) return true;
        const d = new Date(a.announcementDate).getTime();
        return d >= fromTs && d < toTs;
      })
    }

    // codeFilter: Server cannot filter by company server-side, must do it here
    if (codeFilter)    list = list.filter((a) => a.bseCode === codeFilter || a.scriptCode === codeFilter)
    if (onlyWatchlist) list = list.filter((a) => watchlistCodes.has(a.bseCode))
    if (catFilter)     list = list.filter((a) => a.category.toLowerCase().includes(catFilter.toLowerCase()))
    
    // Exchange filtering
    if (exchange === 'BSE') list = list.filter(a => a.bseCode || (a.source === 'BSE' || !a.nseSymbol))
    if (exchange === 'NSE') list = list.filter(a => a.nseSymbol || a.source === 'NSE')
    
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((a) =>
        a.scriptName?.toLowerCase().includes(q) ||
        a.bseCode?.includes(q) ||
        a.subject?.toLowerCase().includes(q) ||
        a.category?.toLowerCase().includes(q)
      )
    }
    return list
  }, [allItems, codeFilter, catFilter, search, onlyWatchlist, watchlistCodes, exchange])

  // Stats scoped to codeFilter context: if a company is selected, scope watchlist/critical to that
  const baseList         = codeFilter ? allItems.filter((a) => a.bseCode === codeFilter || a.scriptCode === codeFilter) : allItems
  const paginated        = filtered.slice(0, page * PAGE_SIZE)
  const hasMore          = paginated.length < filtered.length
  const watchlistMatched = baseList.filter((a) => watchlistCodes.has(a.bseCode)).length
  const criticalCount    = baseList.filter((a) => a.critical).length
  const activeFilters    = [catFilter, codeFilter, search, onlyWatchlist].filter(Boolean).length
  const companyFiltered  = codeFilter && result  // true when showing a specific company's data

  return (
    <PageTransition className="space-y-6 pb-12">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-textPrimary">All Announcements</h1>
          <p className="text-sm text-textMuted mt-0.5">Browse all corporate filings across every listed company (BSE + NSE)</p>
        </div>
        {result && (
          <button onClick={() => exportToXLSX(filtered, `bse_announcements_${toYYYYMMDD(fromDate)}_${toYYYYMMDD(toDate)}.xlsx`)}
            disabled={!filtered.length}
            className="flex items-center gap-2 px-4 py-2 border border-border text-sm font-medium text-textMuted hover:text-emerald-400 hover:border-emerald-500/40 disabled:opacity-40 rounded-lg transition">
            <Download className="w-4 h-4" /> Export Excel
          </button>
        )}
      </div>

      {/* ── Filters card ── */}
      <div className="glass-panel rounded-2xl p-6 space-y-5 shadow-2xl">
        {/* Quick range buttons */}
        <div className="flex flex-wrap gap-2">
          {QUICK_RANGES.map((r) => (
            <button key={r.label} onClick={() => applyQuickRange(r)}
              className={clsx('text-[11px] px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-semibold transition hover:-translate-y-0.5 shadow-sm border',
                fromDate === r.from() && toDate === r.to()
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-surface border-border text-textMuted hover:border-primary/40 hover:text-textPrimary')}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Main filter row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className="block text-[10px] sm:text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-1.5">From Date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/50 shadow-inner transition-all cursor-pointer" />
          </div>
          <div>
            <label className="block text-[10px] sm:text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-1.5">To Date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/50 shadow-inner transition-all cursor-pointer" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] sm:text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-1.5">Filter by Script</label>
            <ScriptSearchInput
              placeholder="Search company…"
              onSelect={(item) => { setCodeFilter(item ? item.bseCode : ''); setCodeLabel(item ? item.scripName : ''); setResult(null) }}
              onClear={() => { setCodeFilter(''); setCodeLabel(''); setResult(null) }}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] sm:text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-1.5">Category</label>
            <div className="relative">
              <select
                value={catFilter}
                onChange={(e) => { setCatFilter(e.target.value); setPage(1) }}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/50 shadow-inner transition-all appearance-none pr-8 cursor-pointer"
              >
                <option value="">All Categories</option>
                {result && categoryOptions.length > 0
                  ? categoryOptions.map(([cat, cnt]) => (
                      <option key={cat} value={cat}>{cat} ({cnt.toLocaleString()})</option>
                    ))
                  : KNOWN_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))
                }
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap justify-between mt-2">
          <div className="flex items-center gap-4">
            <button onClick={fetchAnnouncements} disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition">
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
              {loading ? 'Fetching…' : 'Fetch Announcements'}
            </button>
            
            {/* Exchange Switch */}
            <div className="flex items-center bg-surface border border-border rounded-xl p-1 shadow-inner h-[40px] sm:h-[42px]">
              <button
                onClick={() => setExchange('BSE')}
                className={clsx(
                  "flex items-center justify-center gap-2 px-5 text-sm font-semibold rounded-lg transition-all h-full",
                  exchange === 'BSE' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
                )}
              >
                BSE
              </button>
              <button
                onClick={() => setExchange('NSE')}
                className={clsx(
                  "flex items-center justify-center gap-2 px-5 text-sm font-semibold rounded-lg transition-all h-full",
                  exchange === 'NSE' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
                )}
              >
                NSE
              </button>
              <button
                onClick={() => setExchange('BOTH')}
                className={clsx(
                  "flex items-center justify-center gap-2 px-5 text-sm font-semibold rounded-lg transition-all h-full",
                  exchange === 'BOTH' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
                )}
              >
                BOTH
              </button>
            </div>
          </div>
          {watchlist.length > 0 && result && (
            <button onClick={() => { setOnlyWatchlist((v) => !v); setPage(1) }}
              className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition',
                onlyWatchlist
                  ? 'bg-warning/15 border-warning/40 text-warning'
                  : 'border-border text-textMuted hover:text-textPrimary hover:border-border/80')}>
              <Star className={clsx('w-4 h-4', onlyWatchlist && 'fill-warning')} />
              Watchlist only {onlyWatchlist && `(${watchlistMatched})`}
            </button>
          )}
          {activeFilters > 0 && (
            <button onClick={() => { setCatFilter(''); setCodeFilter(''); setCodeLabel(''); setSearch(''); setOnlyWatchlist(false); setPage(1); setResult(null) }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-textMuted hover:text-danger border border-border hover:border-danger/40 rounded-lg transition">
              <X className="w-3.5 h-3.5" /> Clear filters ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-danger/10 border border-danger/30 rounded-xl text-sm text-danger">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface border border-border rounded-xl" />)}
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-4 flex gap-3">
              <div className="w-1 rounded-full bg-border" style={{ minHeight: 60 }} />
              <div className="flex-1 space-y-2">
                <div className="flex gap-2"><div className="h-4 w-20 bg-border rounded" /><div className="h-4 w-28 bg-border rounded" /></div>
                <div className="h-4 w-48 bg-border rounded" />
                <div className="h-3 w-full bg-border rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Results ── */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Company scope banner — shown when a specific script is selected */}
          {companyFiltered && (
            <div className="flex items-start gap-3 px-4 py-3 bg-primary/8 border border-primary/25 rounded-xl text-sm">
              <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-textPrimary">{codeLabel}</span>
                <span className="text-textMuted ml-1.5">
                  — {baseList.length > 0
                    ? <><strong className="text-textPrimary">{baseList.length}</strong> announcement{baseList.length !== 1 ? 's' : ''} found in the selected period</>
                    : <span className="text-warning font-medium">No announcements found for this company in the selected period</span>
                  }
                </span>
                <span className="text-textMuted opacity-60 ml-1 text-xs">
                  (BSE fetches all {result.rawTotal?.toLocaleString()} filings then filters)
                </span>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={companyFiltered ? 'This Company' : 'Total Fetched'}
              value={companyFiltered ? baseList.length.toLocaleString() : (result.rawTotal?.toLocaleString() ?? 0)}
              icon={Bell} iconColor="bg-primary/10"
              sub={companyFiltered ? `${result.rawTotal?.toLocaleString()} total fetched` : undefined}
            />
            <StatCard
              label="After Filter"
              value={filtered.length.toLocaleString()}
              icon={Filter} iconColor="bg-blue-500/10" color="text-primary"
            />
            <StatCard label="In Your Watchlist" value={watchlistMatched.toLocaleString()} icon={Star}    iconColor="bg-warning/10"  color="text-warning" />
            <StatCard label="Critical"          value={criticalCount.toLocaleString()}    icon={AlertCircle} iconColor="bg-danger/10" color={criticalCount > 0 ? 'text-danger' : 'text-textMuted'} />
          </div>

          {/* Category chips — built from filtered scope when company is selected, else all items */}
          {categoryOptions.length > 0 && baseList.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setCatFilter(''); setPage(1) }}
                className={clsx('inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition font-medium',
                  !catFilter ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-textMuted hover:border-primary/30 hover:text-textPrimary')}>
                All <span className="opacity-70">{(companyFiltered ? baseList : allItems).length.toLocaleString()}</span>
              </button>
              {categoryOptions.slice(0, 10).map(([cat, cnt]) => (
                <button key={cat} onClick={() => { setCatFilter(c => c === cat ? '' : cat); setPage(1) }}
                  className={clsx('inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition font-medium',
                    catFilter === cat
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-textMuted hover:border-primary/30 hover:text-textPrimary')}>
                  {cat} <span className="opacity-60">{cnt.toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}

          {/* In-results search */}
          {(companyFiltered ? baseList.length > 0 : true) && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder={companyFiltered ? `Search within ${codeLabel} announcements…` : 'Search — company name, BSE code, subject…'}
                className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted focus:outline-none focus:border-primary/60" />
              {search && (
                <button onClick={() => { setSearch(''); setPage(1) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary transition">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Active filter summary line */}
          {activeFilters > 0 && filtered.length > 0 && (
            <p className="text-xs text-textMuted px-1">
              Showing <strong className="text-textPrimary">{filtered.length.toLocaleString()}</strong>
              {!companyFiltered && <span> of <strong className="text-textPrimary">{allItems.length.toLocaleString()}</strong></span>} announcements
              {catFilter && <span className="ml-1">· Category: <span className="text-primary">{catFilter}</span></span>}
              {onlyWatchlist && <span className="ml-1">· <span className="text-warning">Watchlist only</span></span>}
            </p>
          )}

          {/* Cards */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="w-10 h-10 text-textMuted mb-4" />
              {companyFiltered && baseList.length === 0 ? (
                <>
                  <p className="text-textPrimary text-sm font-semibold mb-1">
                    No announcements for {codeLabel}
                  </p>
                  <p className="text-textMuted text-xs max-w-xs">
                    <strong>{codeLabel}</strong> (BSE: {codeFilter}) did not file any announcements on BSE
                    during {fromDate} to {toDate}.
                  </p>
                  <p className="text-textMuted text-xs mt-2 opacity-60">
                    Try a wider date range or check the BSE website directly.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-textMuted text-sm font-medium">No announcements match your current filters</p>
                  <button onClick={() => { setCatFilter(''); setSearch(''); setOnlyWatchlist(false) }}
                    className="mt-3 text-xs text-primary hover:underline">Clear filters</button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {paginated.map((a) => {
                const inWatchlist = watchlistCodes.has(a.bseCode)
                return (
                  <div key={a.id || `${a.bseCode}-${a.announcementDate}`}
                    className={clsx(
                      'group bg-surface border rounded-xl p-4 flex gap-3 hover:border-primary/40 transition-all',
                      inWatchlist ? 'border-warning/25 ring-1 ring-warning/10' : 'border-border',
                      a.critical && 'border-danger/30 ring-1 ring-danger/10'
                    )}>
                    {/* Color bar */}
                    <div className={clsx('w-1 rounded-full flex-shrink-0',
                      a.critical ? 'bg-danger' : inWatchlist ? 'bg-warning' : 'bg-primary/40')}
                      style={{ minHeight: 52 }} />
                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex items-center flex-wrap gap-1.5 mb-2">
                        {a.category && (
                          <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full border', getCategoryColor(a.category))}>
                            {a.category.split(' / ')[0]}
                          </span>
                        )}
                        {a.critical && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30 font-semibold tracking-wide">
                            CRITICAL
                          </span>
                        )}
                        {inWatchlist && (
                          <span className="flex items-center gap-1 text-xs text-warning font-medium">
                            <Star className="w-3 h-3 fill-warning" /> Watchlist
                          </span>
                        )}
                      </div>
                      {/* Company + code — clickable to Company Data */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <button
                          onClick={() => a.bseCode && navigate('/company-data', { state: { script: { bseCode: a.bseCode, scripName: a.scriptName, symbol: a.nseSymbol || '' } } })}
                          className="text-sm font-semibold text-textPrimary hover:text-primary transition text-left"
                          title="View company data"
                        >
                          {a.scriptName}
                        </button>
                        {a.bseCode && (
                          <code className="text-xs font-mono text-textMuted bg-background px-1.5 py-0.5 rounded border border-border">{a.bseCode}</code>
                        )}
                        {a.nseSymbol && (
                          <code className="text-xs font-mono text-textMuted opacity-70">{a.nseSymbol}</code>
                        )}
                      </div>
                      {/* Subject */}
                      <p className="text-sm text-textMuted leading-snug line-clamp-2 mb-2">{a.subject}</p>
                      {/* Footer */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-textMuted tabular-nums">{a.datetimeIST || a.announcementDate}</span>
                        <div className="flex items-center gap-0.5">
                          {a.pdfUrl && (
                            <a href={a.pdfUrl} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 text-textMuted hover:text-primary transition rounded-lg hover:bg-primary/10" title="View PDF">
                              <FileText className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {a.sourceUrl && (
                            <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 text-textMuted hover:text-primary transition rounded-lg hover:bg-primary/10" title="View on BSE">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {hasMore && (
                <div className="text-center pt-3">
                  <button onClick={() => setPage((p) => p + 1)}
                    className="px-8 py-2.5 border border-border text-sm text-textMuted hover:text-textPrimary hover:border-primary/40 rounded-xl transition">
                    Load {Math.min(PAGE_SIZE, filtered.length - paginated.length)} more
                    <span className="ml-1 opacity-60">({(filtered.length - paginated.length).toLocaleString()} remaining)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Empty initial state ── */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 glass-panel rounded-3xl flex items-center justify-center mb-6 shadow-2xl">
            <Bell className="w-10 h-10 text-primary" />
          </div>
          <p className="text-textPrimary font-bold mb-2 text-xl tracking-tight">Ready to browse announcements</p>
          <p className="text-sm text-textMuted max-w-sm">
            Pick a date range above and click <strong className="text-textPrimary">Fetch Announcements</strong>.
            Large ranges (7+ days) may take 30–60 seconds.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            {QUICK_RANGES.map((r) => (
              <button key={r.label} onClick={() => applyQuickRange(r)}
                className="text-xs px-4 py-2 border border-white/10 text-textMuted hover:border-primary/40 hover:text-textPrimary rounded-xl transition bg-black/20 hover:bg-primary/10 font-semibold shadow-sm">
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </PageTransition>
  )
}
