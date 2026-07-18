import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, ChevronLeft, ChevronRight, RefreshCw,
  Filter, LayoutList, CalendarDays, ExternalLink, Search, X,
  Building2, ChevronDown,
} from 'lucide-react'
import clsx from 'clsx'
import { useWatchlist } from '../../contexts/WatchlistContext'
import PageTransition from '../Common/PageTransition'

const BACKEND = import.meta.env.VITE_BACKEND_URL || ''

// ── Category definitions ────────────────────────────────────────────────────
const CATS = [
  { key: '',              label: 'All',           color: 'bg-primary/15 text-primary border-primary/30',                  dot: 'bg-primary'   },
  { key: 'Board Meeting', label: 'Board Meeting',  color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',              dot: 'bg-blue-400'  },
  { key: 'Dividend',      label: 'Dividend',       color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',     dot: 'bg-emerald-400' },
  { key: 'Bonus',         label: 'Bonus',          color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',           dot: 'bg-amber-400' },
  { key: 'AGM',           label: 'AGM',            color: 'bg-violet-500/15 text-violet-400 border-violet-500/30',        dot: 'bg-violet-400' },
  { key: 'Rights Issue',  label: 'Rights',         color: 'bg-orange-500/15 text-orange-400 border-orange-500/30',        dot: 'bg-orange-400' },
  { key: 'Stock Split',   label: 'Split',          color: 'bg-pink-500/15 text-pink-400 border-pink-500/30',              dot: 'bg-pink-400'  },
  { key: 'Buyback',       label: 'Buyback',        color: 'bg-red-500/15 text-red-400 border-red-500/30',                 dot: 'bg-red-400'   },
]

const QUICK_RANGES = [
  { label: 'Today',     from: () => new Date().toISOString().slice(0, 10), to: () => new Date().toISOString().slice(0, 10) },
  { label: 'Tomorrow',  from: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }, to: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) } },
  { label: 'Next 7 Days', from: () => new Date().toISOString().slice(0, 10), to: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) } },
  { label: 'Next 30 Days', from: () => new Date().toISOString().slice(0, 10), to: () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) } },
]

// Board-meeting sub-purpose filter options
const PURPOSE_OPTS = [
  { key: '',                    label: 'All Purposes'         },
  { key: 'Quarterly Results',   label: 'Quarterly Results'    },
  { key: 'Audited Results',     label: 'Audited Results'      },
  { key: 'Half Yearly Results', label: 'Half Yearly Results'  },
  { key: 'A.G.M.',              label: 'AGM'                  },
  { key: 'Dividend',            label: 'Dividend Declaration' },
  { key: 'Bonus',               label: 'Bonus Issue'          },
  { key: 'Preferential',        label: 'Preferential Issue'   },
  { key: 'Right Issue',         label: 'Rights Issue'         },
  { key: 'General',             label: 'General'              },
]

function catMeta(cat) {
  return CATS.find(c => c.key && cat?.toLowerCase().includes(c.key.toLowerCase())) || CATS[0]
}

function fmtDisp(iso) {
  if (!iso) return '—'
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}



// ── Dropdown component ───────────────────────────────────────────────────────
function Dropdown({ value, options, onChange, placeholder = 'Select…', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find(o => o.key === value)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-xl text-xs text-textMuted hover:text-textPrimary hover:border-primary/40 transition w-full"
      >
        <span className="flex-1 text-left truncate">
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={clsx('w-3.5 h-3.5 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 min-w-full bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false) }}
              className={clsx(
                'w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition',
                opt.key === value ? 'text-primary font-medium' : 'text-textMuted'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CorporateCalendarPage() {
  const navigate = useNavigate()
  const { watchlist } = useWatchlist()

  const now = new Date()
  const getISTDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = () => getISTDate();
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30) // 30 days ahead by default
    return d.toISOString().slice(0, 10)
  })
  const [activeCat, setActiveCat] = useState('')
  const [activePurpose, setActivePurpose] = useState('')
  const [wlOnly, setWlOnly]       = useState(false)
  const [search, setSearch]       = useState('')
  const [events, setEvents]       = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const wlCodes = useMemo(
    () => new Set(watchlist.map(s => s.bseCode || s.ltdCode || '')),
    [watchlist]
  )

  const toYYYYMMDD = (d) => d.replace(/-/g, '')

  async function fetchEvents(bust = false) {
    if (!fromDate || !toDate) return
    setLoading(true); setError(null)
    try {
      const qs = `from=${toYYYYMMDD(fromDate)}&to=${toYYYYMMDD(toDate)}${bust ? '&bust=1' : ''}`
      const data = await fetch(`${BACKEND}/api/bse/calendar?${qs}`).then(r => r.json())
      if (data.error) throw new Error(data.error)
      setEvents(data.events || [])
      setFetchedAt(new Date())
    } catch (e) {
      setError(e.message)
      setEvents([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchEvents() }, [fromDate, toDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // When switching away from Board Meeting, clear purpose filter
  useEffect(() => { if (activeCat !== '' && activeCat !== 'Board Meeting') setActivePurpose('') }, [activeCat])

  const displayed = useMemo(() => {
    let list = events
    if (activeCat)     list = list.filter(e => e.category === activeCat)
    if (activePurpose) list = list.filter(e => e.purpose?.toLowerCase().includes(activePurpose.toLowerCase()))
    if (wlOnly)        list = list.filter(e => wlCodes.has(e.bseCode))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e => e.company?.toLowerCase().includes(q) || e.bseCode?.includes(q) || e.purpose?.toLowerCase().includes(q))
    }
    return list
  }, [events, activeCat, activePurpose, wlOnly, wlCodes, search])

  // Category counts from raw events (not filtered)
  const catCounts = useMemo(() => {
    const map = {}
    for (const e of events) map[e.category] = (map[e.category] || 0) + 1
    return map
  }, [events])

  const grouped = useMemo(() => {
    const map = {}
    for (const e of displayed) {
      const key = e.exDate || ''
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [displayed])



  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const p2 = (n) => String(n).padStart(2, '0')

  function goCompany(e) {
    if (!e.bseCode) return
    navigate('/company-data', { state: { script: { bseCode: e.bseCode, scripName: e.company, symbol: '' } } })
  }

  const showPurposeFilter = activeCat === '' || activeCat === 'Board Meeting'

  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-textPrimary flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Corporate Calendar
          </h1>
          <p className="text-xs text-textMuted mt-0.5">
            Board meetings, results, dividends, AGMs &amp; corporate actions
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => fetchEvents(true)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-xl text-xs text-textMuted hover:text-textPrimary hover:border-primary/40 disabled:opacity-50 transition"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline ml-1">Refresh</span>
          </button>
        </div>
      </div>

      {/* Date filter + search + watchlist */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap bg-surface/50 p-2 rounded-2xl border border-white/5 shadow-inner">
        <div className="flex flex-wrap gap-2 mr-2">
          {QUICK_RANGES.map((r) => (
            <button key={r.label} onClick={() => { setFromDate(r.from()); setToDate(r.to()) }}
              className={clsx('text-[11px] px-3 py-1.5 rounded-xl font-semibold transition shadow-sm border',
                fromDate === r.from() && toDate === r.to()
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-black/20 border-white/5 text-textMuted hover:border-primary/40 hover:text-textPrimary')}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 flex-shrink-0 shadow-sm transition-colors hover:border-white/20">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="bg-transparent text-sm text-textPrimary focus:outline-none cursor-pointer" />
          <span className="text-textMuted text-sm">–</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="bg-transparent text-sm text-textPrimary focus:outline-none cursor-pointer" />
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted/50" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search company code…"
            className="w-full pl-7 pr-7 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-textPrimary placeholder:text-textMuted/40 focus:outline-none focus:border-primary/40 transition shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted/50 hover:text-textMuted">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Watchlist filter */}
        <button
          onClick={() => setWlOnly(v => !v)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition flex-shrink-0',
            wlOnly
              ? 'bg-primary/15 text-primary border-primary/30'
              : 'bg-surface text-textMuted border-border hover:border-primary/40 hover:text-textPrimary'
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          Watchlist only
        </button>

        {!loading && (
          <span className="text-xs text-textMuted sm:ml-auto flex-shrink-0">
            {displayed.length} of {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATS.map(({ key, label, color, dot }) => {
          const count = key ? (catCounts[key] || 0) : events.length
          return (
            <button
              key={key}
              onClick={() => setActiveCat(key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition hover:-translate-y-0.5',
                activeCat === key
                  ? color
                  : 'bg-white/5 text-textMuted border-white/10 hover:border-primary/40 hover:text-textPrimary shadow-sm'
              )}
            >
              {key && <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', activeCat === key ? dot : 'bg-textMuted/40')} />}
              {label}
              {count > 0 && (
                <span className={clsx('text-[10px] px-1 py-0.5 rounded-full ml-0.5',
                  activeCat === key ? 'bg-white/10' : 'bg-white/5 text-textMuted/60'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Purpose sub-filter (Board Meeting only) */}
      {showPurposeFilter && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-textMuted flex-shrink-0">Purpose:</span>
          <Dropdown
            value={activePurpose}
            options={PURPOSE_OPTS}
            onChange={setActivePurpose}
            className="w-48"
          />
          {activePurpose && (
            <button onClick={() => setActivePurpose('')} className="text-xs text-textMuted hover:text-primary transition flex items-center gap-1">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-textMuted">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Fetching corporate events…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-5 text-center">
          <p className="text-sm text-danger mb-1">Could not load events</p>
          <p className="text-xs text-textMuted">{error}</p>
          <button onClick={() => fetchEvents(true)} className="mt-3 text-xs text-primary hover:text-primary/80 transition">
            Try again
          </button>
        </div>
      )}

      {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <>
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-surface border border-border rounded-xl">
              <Calendar className="w-10 h-10 text-textMuted/20 mb-3" />
              <p className="text-sm text-textMuted">No events found for the selected dates</p>
              <p className="text-xs text-textMuted/50 mt-1">
                {wlOnly ? 'Try disabling "Watchlist only"' :
                 search  ? 'Try clearing the search filter' :
                 activeCat ? 'Try a different category' :
                 'Data may not be published for this period yet'}
              </p>
              {(wlOnly || search || activeCat) && (
                <button
                  onClick={() => { setWlOnly(false); setSearch(''); setActiveCat(''); setActivePurpose('') }}
                  className="mt-3 text-xs text-primary hover:text-primary/80 transition"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([dateKey, evts]) => (
                <div key={dateKey}>
                  {/* Date separator */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className={clsx(
                      'text-xs font-bold px-3 py-1.5 rounded-lg border flex-shrink-0',
                      dateKey === todayStr
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-surface text-textMuted border-border'
                    )}>
                      {dateKey ? fmtDisp(dateKey) : 'Date TBD'}
                      {dateKey === todayStr && <span className="ml-1.5 text-[10px] bg-primary/20 px-1.5 py-0.5 rounded">Today</span>}
                    </span>
                    <div className="flex-1 h-px bg-border/60" />
                    <span className="text-xs text-textMuted/50 flex-shrink-0">{evts.length}</span>
                  </div>

                  {/* Cards grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {evts.map((e, i) => {
                      const meta = catMeta(e.category)
                      return (
                        <EventCard
                          key={i}
                          event={e}
                          meta={meta}
                          onCompany={() => goCompany(e)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      {fetchedAt && !loading && (
        <p className="text-[11px] text-textMuted/40 text-center pb-2">
          Board meeting data &amp; corporate actions · Cached 30 min ·
          Last fetched {fetchedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </PageTransition>
  )
}

// ── Event card ───────────────────────────────────────────────────────────────
function EventCard({ event: e, meta, onCompany }) {
  const [expanded, setExpanded] = useState(false)
  const hasDates = e.exDate || e.recDate || e.bcStart || e.ndStart || e.payDate

  return (
    <div className="glass-panel hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl rounded-2xl p-5 transition-all flex flex-col gap-3 group">
      {/* Company row */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onCompany}
          className="text-sm font-semibold text-textPrimary hover:text-primary transition text-left leading-snug flex-1 min-w-0 flex items-start gap-1.5"
        >
          <Building2 className="w-3.5 h-3.5 text-textMuted/40 mt-0.5 flex-shrink-0" />
          <span className="truncate" title={e.company}>{e.company || '—'}</span>
        </button>
        {e.bseCode && (
          <button
            onClick={onCompany}
            className="text-[10px] font-mono text-primary/70 hover:text-primary bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded border border-primary/20 flex-shrink-0 transition cursor-pointer"
            title="View Company Data"
          >
            {e.bseCode}
          </button>
        )}
      </div>

      {/* Category badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={clsx('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border', meta.color)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', meta.dot)} />
          {e.category}
        </span>
        {e.industry && (
          <span className="text-[10px] text-textMuted/70 bg-background px-2 py-0.5 rounded border border-border truncate max-w-[150px]" title={e.industry}>
            {e.industry}
          </span>
        )}
      </div>

      {/* Purpose */}
      {e.purpose && (
        <div className="bg-background/50 border border-border/50 rounded-lg p-2.5">
          <p className={clsx(
            'text-xs text-textMuted/90 leading-relaxed whitespace-pre-wrap',
            !expanded && 'line-clamp-3'
          )}>
            {e.purpose}
          </p>
          {e.purpose.length > 120 && (
            <button onClick={() => setExpanded(v => !v)} className="text-[10px] font-medium text-primary/80 hover:text-primary transition mt-1.5 text-left inline-flex items-center gap-1">
              {expanded ? 'Show less' : 'Read full purpose'}
            </button>
          )}
        </div>
      )}

      {/* Record / BC / Ex dates */}
      {hasDates && (
        <div className="grid grid-cols-2 gap-2 mt-auto pt-2 border-t border-border/40">
          {e.exDate && (
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider text-textMuted/50 font-semibold mb-0.5">Ex-Date</span>
              <span className="text-[11px] text-textMuted font-medium">{fmtDisp(e.exDate)}</span>
            </div>
          )}
          {e.recDate && (
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider text-textMuted/50 font-semibold mb-0.5">Record Date</span>
              <span className="text-[11px] text-textMuted font-medium">{fmtDisp(e.recDate)}</span>
            </div>
          )}
          {e.bcStart && (
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider text-textMuted/50 font-semibold mb-0.5">Book Closure</span>
              <span className="text-[11px] text-textMuted font-medium">
                {fmtDisp(e.bcStart)} {e.bcEnd ? ` to ${fmtDisp(e.bcEnd)}` : ''}
              </span>
            </div>
          )}
          {e.ndStart && (
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider text-textMuted/50 font-semibold mb-0.5">No Delivery</span>
              <span className="text-[11px] text-textMuted font-medium">
                {fmtDisp(e.ndStart)} {e.ndEnd ? ` to ${fmtDisp(e.ndEnd)}` : ''}
              </span>
            </div>
          )}
          {e.payDate && (
            <div className="flex flex-col col-span-2">
              <span className="text-[9px] uppercase tracking-wider text-textMuted/50 font-semibold mb-0.5">Payment Date</span>
              <span className="text-[11px] text-primary/80 font-medium">{fmtDisp(e.payDate)}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 mt-1 border-t border-border/40">
        <button
          onClick={onCompany}
          className="flex-1 flex justify-center items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 py-1.5 rounded-lg transition"
        >
          <Building2 className="w-3.5 h-3.5" />
          Company Data
        </button>
        {e.bseUrl && (
          <a
            href={e.bseUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={ev => ev.stopPropagation()}
            className="flex justify-center items-center gap-1.5 text-[11px] font-medium text-textMuted hover:text-textPrimary bg-background hover:bg-white/5 border border-border py-1.5 px-3 rounded-lg transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Source
          </a>
        )}
      </div>
    </div>
  )
}
