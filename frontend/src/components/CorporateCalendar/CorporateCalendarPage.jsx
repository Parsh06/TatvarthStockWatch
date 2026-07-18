import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, RefreshCw, Filter, Search, X, Building2, ChevronDown, Info
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
  { label: 'Next 7 Days', from: () => new Date().toISOString().slice(0, 10), to: () => { const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10) } },
  { label: 'Next 14 Days', from: () => new Date().toISOString().slice(0, 10), to: () => { const d = new Date(); d.setDate(d.getDate() + 13); return d.toISOString().slice(0, 10) } },
]

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

  const getISTDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = () => getISTDate();
  
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 6) // default next 7 days for weekly view
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

  const catCounts = useMemo(() => {
    const map = {}
    for (const e of events) map[e.category] = (map[e.category] || 0) + 1
    return map
  }, [events])

  // Build Kanban columns based on date range
  const { dateCols, groupedEvents, otherEvents } = useMemo(() => {
    const cols = [];
    const grouped = {};
    
    // Generate dates
    let curr = new Date(fromDate);
    const end = new Date(toDate);
    let count = 0;
    while (curr <= end && count < 60) { // max 60 days to prevent infinite loops
      const dateStr = curr.toISOString().slice(0, 10);
      cols.push(dateStr);
      grouped[dateStr] = [];
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    const others = [];

    // Assign events to dates
    for (const e of displayed) {
      // Find the primary date for this event
      const dateKey = e.date || e.exDate || e.recDate || e.bcStart || e.ndStart || e.payDate || '';
      if (dateKey && grouped[dateKey]) {
        grouped[dateKey].push(e);
      } else {
        // Falls outside the exact column dates or has no date
        others.push(e);
      }
    }

    return { dateCols: cols, groupedEvents: grouped, otherEvents: others };
  }, [displayed, fromDate, toDate])

  function goCompany(e) {
    if (!e.bseCode) return
    navigate('/company-data', { state: { script: { bseCode: e.bseCode, scripName: e.company, symbol: '' } } })
  }

  const showPurposeFilter = activeCat === '' || activeCat === 'Board Meeting'

  const formatHeaderDay = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' })
  }
  const formatHeaderDate = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  return (
    <PageTransition className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-textPrimary flex items-center gap-2 uppercase tracking-wide">
            <Calendar className="w-5 h-5 text-emerald-500" />
            EARNINGS PULSE - THE WEEK AHEAD
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap bg-surface/50 p-2 rounded-2xl border border-white/5 shadow-inner flex-shrink-0">
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
          Watchlist
        </button>

        {!loading && (
          <span className="text-xs text-textMuted sm:ml-auto flex-shrink-0">
            {displayed.length} events
          </span>
        )}
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
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

        {/* Purpose sub-filter (Board Meeting only) */}
        {showPurposeFilter && (
          <div className="flex items-center gap-2 ml-2">
            <Dropdown
              value={activePurpose}
              options={PURPOSE_OPTS}
              onChange={setActivePurpose}
              className="w-40"
            />
            {activePurpose && (
              <button onClick={() => setActivePurpose('')} className="p-2 text-textMuted hover:text-primary transition bg-surface border border-border rounded-xl">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading & Error */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-textMuted flex-1">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Fetching corporate events…</span>
        </div>
      )}
      {!loading && error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-5 text-center flex-1 mt-4">
          <p className="text-sm text-danger mb-1">Could not load events</p>
          <p className="text-xs text-textMuted">{error}</p>
          <button onClick={() => fetchEvents(true)} className="mt-3 text-xs text-primary hover:text-primary/80 transition">
            Try again
          </button>
        </div>
      )}

      {/* ── KANBAN WEEKLY VIEW ─────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar flex gap-2 pb-4 pt-2">
          {dateCols.map(dateStr => {
            const dayEvents = groupedEvents[dateStr] || [];
            const isToday = dateStr === today();
            
            return (
              <div key={dateStr} className="flex-1 min-w-[200px] max-w-[280px] flex flex-col bg-[#111318] border border-white/5 rounded-xl overflow-hidden shrink-0">
                <div className={clsx(
                  "text-center py-2 border-b border-black/40",
                  isToday ? "bg-emerald-600/90 text-white shadow-[0_0_15px_rgba(5,150,105,0.3)]" : "bg-[#1A1C23] text-gray-200"
                )}>
                  <div className="text-[11px] font-black uppercase tracking-widest">{formatHeaderDay(dateStr)}</div>
                  <div className="text-[10px] font-medium opacity-75">{formatHeaderDate(dateStr)}</div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1 bg-[#111318]">
                  {dayEvents.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <span className="text-[10px] text-textMuted/30 font-medium tracking-wider">NO EVENTS</span>
                    </div>
                  ) : (
                    dayEvents.map((e, i) => (
                      <CompactEventCard key={i} event={e} meta={catMeta(e.category)} onCompany={() => goCompany(e)} />
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {otherEvents.length > 0 && (
            <div className="flex-1 min-w-[200px] max-w-[280px] flex flex-col bg-[#111318] border border-white/5 rounded-xl overflow-hidden shrink-0 opacity-80">
              <div className="bg-[#1A1C23] text-gray-400 text-center py-2 border-b border-black/40">
                <div className="text-[11px] font-black uppercase tracking-widest">OTHER DATES</div>
                <div className="text-[10px] font-medium opacity-75">TBD / Outside Range</div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1 bg-[#111318]">
                {otherEvents.map((e, i) => (
                  <CompactEventCard key={`other-${i}`} event={e} meta={catMeta(e.category)} onCompany={() => goCompany(e)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {fetchedAt && !loading && (
        <p className="text-[11px] text-textMuted/40 text-center pb-2 flex-shrink-0 mt-2">
          Board meeting data &amp; corporate actions · Cached 30 min ·
          Last fetched {fetchedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </PageTransition>
  )
}

// ── Compact Event Card ────────────────────────────────────────────────────────
function CompactEventCard({ event: e, meta, onCompany }) {
  const shortPurpose = e.purpose ? e.purpose.split(' ').slice(0, 4).join(' ') + (e.purpose.split(' ').length > 4 ? '...' : '') : '';
  
  // Custom tooltip content
  const tooltipText = `Company: ${e.company}\nCategory: ${e.category}\nPurpose: ${e.purpose || 'N/A'}`;

  return (
    <button
      onClick={onCompany}
      title={tooltipText}
      className="w-full text-left group bg-white/[0.02] hover:bg-white/[0.08] border border-transparent hover:border-white/10 rounded-lg p-2 transition-all flex items-center gap-2 relative overflow-hidden"
    >
      <div className={clsx("w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0", meta.dot || "bg-primary")}>
        <span className="text-[8px] font-bold text-black/80">{e.company?.charAt(0) || 'C'}</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="text-xs font-semibold text-gray-200 group-hover:text-white truncate block uppercase tracking-tight">
          {e.company || '—'}
        </span>
        {shortPurpose && (
          <span className="text-[9px] text-gray-500 truncate block">
            {shortPurpose}
          </span>
        )}
      </div>
    </button>
  )
}
