import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Search, RefreshCw, AlertCircle, TrendingUp, TrendingDown,
  BarChart2, Users, Activity, Layers, Info, ChevronDown, ChevronUp,
  Star, Bell, CheckCircle2, Target, PieChart, Calendar, Percent,
  ThumbsUp, ThumbsDown, Minus, Package, Briefcase,
} from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { useWatchlist } from '../../contexts/WatchlistContext'
import ScriptSearchInput from '../Common/ScriptSearchInput'
import SetAlertModal from '../Watchlist/SetAlertModal'
import PageTransition from '../Common/PageTransition'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts'
import toast from 'react-hot-toast'
import { fmtCr } from '../../utils/formatters.js'

function fmt(v, dec = 2) {
  if (v == null || v === '' || v === '-') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n.toFixed(dec)
}
function display(v, prefix = '', suffix = '', dec = 2) {
  const f = fmt(v, dec)
  return f != null ? `${prefix}${f}${suffix}` : '—'
}

// ── Intraday chart (SVG, no library) ─────────────────────────────────────────
function IntradayChart({ points, prevClose, current }) {
  const svgRef = useRef(null)
  const [hover, setHover] = useState(null)

  const valid = useMemo(() => (points || []).filter((p) => p.p != null), [points])
  if (!valid.length) return <p className="text-xs text-textMuted py-4 text-center">Chart data unavailable</p>

  const W = 700, H = 180, PAD = { t: 12, b: 28, l: 8, r: 8 }
  const cW = W - PAD.l - PAD.r
  const cH = H - PAD.t - PAD.b

  const prices  = valid.map((p) => p.p)
  const minP    = Math.min(...prices, prevClose || Infinity)
  const maxP    = Math.max(...prices, prevClose || -Infinity)
  const range   = maxP - minP || 1

  const xOf = (i) => PAD.l + (i / (valid.length - 1)) * cW
  const yOf = (p) => PAD.t + (1 - (p - minP) / range) * cH

  const path = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.p).toFixed(1)}`).join(' ')
  const area = `${path} L${xOf(valid.length - 1).toFixed(1)},${(PAD.t + cH).toFixed(1)} L${PAD.l.toFixed(1)},${(PAD.t + cH).toFixed(1)} Z`

  const pcY = prevClose != null ? yOf(prevClose) : null

  // Time labels: first, middle, last
  const labels = [0, Math.floor(valid.length / 2), valid.length - 1]
    .map((i) => ({ i, label: valid[i]?.t ? new Date(valid[i].t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '' }))

  const up = current != null && prevClose != null ? current >= prevClose : true
  const lineColor = up ? '#34d399' : '#f87171'

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 180 }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const mx = ((e.clientX - rect.left) / rect.width) * W
          let best = 0, bestDist = Infinity
          valid.forEach((_, i) => { const d = Math.abs(xOf(i) - mx); if (d < bestDist) { bestDist = d; best = i } })
          setHover(best)
        }}
      >
        {/* Prev close reference line */}
        {pcY != null && (
          <line x1={PAD.l} y1={pcY} x2={W - PAD.r} y2={pcY}
            stroke="#6b7280" strokeWidth="1" strokeDasharray="4 3" />
        )}
        {/* Area fill */}
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaGrad)" />
        {/* Line */}
        <path d={path} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
        {/* Hover crosshair */}
        {hover != null && (
          <>
            <line x1={xOf(hover)} y1={PAD.t} x2={xOf(hover)} y2={PAD.t + cH}
              stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={xOf(hover)} cy={yOf(valid[hover].p)} r="3" fill={lineColor} />
          </>
        )}
        {/* Time axis labels */}
        {labels.map(({ i, label }) => (
          <text key={i} x={xOf(i)} y={H - 4}
            textAnchor={i === 0 ? 'start' : i === valid.length - 1 ? 'end' : 'middle'}
            fontSize="9" fill="#6b7280">{label}</text>
        ))}
      </svg>
      {/* Hover tooltip */}
      {hover != null && (
        <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none">
          <div className="bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-textPrimary shadow-md">
            <span className="text-textMuted mr-2">
              {new Date(valid[hover].t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <span className={clsx('font-bold tabular-nums', up ? 'text-emerald-400' : 'text-red-400')}>
              ₹{fmt(valid[hover].p)}
            </span>
            {valid[hover].v > 0 && (
              <span className="text-textMuted ml-2">Vol: {Number(valid[hover].v).toLocaleString('en-IN')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PriceCard({ label, value, color, sub }) {
  return (
    <div className="glass-panel border-t-2 border-t-white/10 rounded-2xl p-4 hover:-translate-y-1 transition-transform">
      <p className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2">{label}</p>
      <p className={clsx('text-xl font-bold font-display tracking-tight tabular-nums', color || 'text-textPrimary')}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] font-medium text-textMuted mt-1.5 opacity-80">{sub}</p>}
    </div>
  )
}

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="glass-panel rounded-2xl overflow-hidden shadow-lg mb-6">
      <button
        className="w-full flex items-center justify-between gap-2 px-6 py-4 border-b border-white/5 bg-black/20 hover:bg-black/40 transition-colors text-left backdrop-blur-md"
        onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-primary/20 text-primary">
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-textPrimary tracking-wide uppercase">{title}</h3>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-textMuted" /> : <ChevronDown className="w-5 h-5 text-textMuted" />}
      </button>
      {open && <div className="p-6">{children}</div>}
    </div>
  )
}

const HIST_RANGES = [
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
]

function HistoricalChart({ points, range }) {
  const valid = useMemo(() => {
    return (points || []).filter((p) => p.close != null).map(p => ({
      ...p,
      dateFormatted: new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    }))
  }, [points])

  if (!valid.length) return <p className="text-xs text-textMuted py-4 text-center">No historical data available</p>

  const first = valid[0]?.close
  const last  = valid[valid.length - 1]?.close
  const up    = last != null && first != null ? last >= first : true
  const lineColor = up ? '#34d399' : '#f87171' // emerald-400 / red-400
  const gradientId = `colorClose-${up ? 'up' : 'down'}`

  const min = Math.min(...valid.map(p => p.close))
  const max = Math.max(...valid.map(p => p.close))
  // Add some padding to domain
  const padding = (max - min) * 0.1
  const domainMin = Math.max(0, min - padding)
  const domainMax = max + padding

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-surface/90 backdrop-blur-md border border-border rounded-lg px-3 py-2 text-xs text-textPrimary shadow-xl">
          <div className="text-textMuted mb-1">{data.date}</div>
          <div className="flex items-center gap-3">
            <span className={clsx('font-bold tabular-nums', up ? 'text-emerald-400' : 'text-red-400')}>
              ₹{fmt(data.close)}
            </span>
            {data.high != null && (
              <span className="text-textMuted">H: <span className="text-emerald-400">₹{fmt(data.high)}</span></span>
            )}
            {data.low != null && (
              <span className="text-textMuted">L: <span className="text-red-400">₹{fmt(data.low)}</span></span>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="w-full h-64 -ml-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={valid} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis 
            dataKey="dateFormatted" 
            tickLine={false} 
            axisLine={false} 
            tick={{ fontSize: 10, fill: '#6b7280' }}
            minTickGap={30}
          />
          <YAxis 
            domain={[domainMin, domainMax]} 
            tickLine={false} 
            axisLine={false} 
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickFormatter={(val) => `₹${fmt(val)}`}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '3 3' }} />
          <Area 
            type="monotone" 
            dataKey="close" 
            stroke={lineColor} 
            strokeWidth={2}
            fillOpacity={1} 
            fill={`url(#${gradientId})`} 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function CompanyDataPage() {
  const location   = useLocation()
  const navigate   = useNavigate()
  const [selected, setSelected]   = useState(null)
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState(null)
  const [data,     setData]       = useState(null)
  const [chart,    setChart]      = useState(null)
  const [alertScript, setAlertScript] = useState(null)
  const [addingToWL,  setAddingToWL]  = useState(false)
  const [histRange,   setHistRange]   = useState('1M')
  const [histData,    setHistData]    = useState(null)
  const [histLoading, setHistLoading] = useState(false)
  const [histTableData, setHistTableData] = useState([])
  const [histTableLoading, setHistTableLoading] = useState(false)
  const [showPortfolioHint, setShowPortfolioHint] = useState(false)

  const { watchlist, addScript } = useWatchlist()

  // Auto-fetch when navigated with location state (e.g. from watchlist/announcements)
  useEffect(() => {
    const script = location.state?.script
    if (script?.bseCode) fetchData(script)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchData(item) {
    if (!item) return
    setSelected(item)
    setLoading(true); setError(null); setData(null); setChart(null); setHistData(null); setHistTableData([])
    try {
      const params = new URLSearchParams({ code: item.bseCode })
      if (item.symbol) params.set('symbol', item.symbol)
      const [companyData, chartData] = await Promise.allSettled([
        apiClient(`/api/bse/company?${params.toString()}`),
        apiClient(`/api/bse/intradaychart?code=${item.bseCode}`),
      ])
      setData({ item, companyData: companyData.status === 'fulfilled' ? companyData.value : null })
      if (chartData.status === 'fulfilled') setChart(chartData.value)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
    // Kick off historical chart in background
    fetchHistory(item, histRange)
  }

  async function fetchHistory(scriptItem, range) {
    if (!scriptItem?.bseCode) return
    setHistLoading(true)
    setHistTableLoading(true)
    try {
      const params = new URLSearchParams({ code: scriptItem.bseCode, range })
      if (scriptItem.symbol) params.set('symbol', scriptItem.symbol)
      const d = await apiClient(`/api/bse/history?${params.toString()}`)
      setHistData(d)

      const today = new Date();
      const fromD = new Date(today);
      if (range === '1W') fromD.setDate(today.getDate() - 7);
      else if (range === '3M') fromD.setMonth(today.getMonth() - 3);
      else if (range === '6M') fromD.setMonth(today.getMonth() - 6);
      else if (range === '1Y') fromD.setFullYear(today.getFullYear() - 1);
      else if (range === '5Y') fromD.setFullYear(today.getFullYear() - 5);
      else fromD.setMonth(today.getMonth() - 1);
      
      const fmtD = (dt) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
      
      const tableData = await apiClient(`/api/bse/historical-table?code=${scriptItem.bseCode}&from=${fmtD(fromD)}&to=${fmtD(today)}`)
      setHistTableData(tableData?.StockData || [])
    } catch {}
    finally { 
      setHistLoading(false)
      setHistTableLoading(false)
    }
  }

  function handleRangeChange(range) {
    setHistRange(range)
    if (selected?.bseCode) fetchHistory(selected, range)
  }

  const item        = data?.item || selected
  const companyData = data?.companyData
  const quote       = companyData?.quote || null

  const ltp       = quote?.ltp
  const prevClose = quote?.prevClose
  const change    = ltp != null && prevClose != null ? ltp - prevClose : null
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null
  const up        = change != null ? change >= 0 : null

  const hasFinancials      = (companyData?.financials?.length        ?? 0) > 0
  const hasShareholding    = (companyData?.shareholding?.rows?.length ?? 0) > 0
  const hasBulkDeals       = (companyData?.bulkDeals?.length         ?? 0) > 0
  const hasHolding         = companyData?.holding != null
  const hasCorpActions     = (companyData?.corporateActions?.length  ?? 0) > 0
  const hasAnalystTargets  = (companyData?.analystTargets?.length    ?? 0) > 0
  const hasQuoteData       = companyData?.quoteData != null

  // Check if the currently-viewed company is already in the watchlist
  const inWatchlist = useMemo(() => {
    if (!item?.bseCode) return null
    return watchlist.find((s) => (s.ltdCode || s.bseCode || '') === item.bseCode) || null
  }, [watchlist, item])

  async function handleAddToWatchlist() {
    if (!item) return
    setAddingToWL(true)
    try {
      const result = await addScript({
        scriptName: item.scripName || item.symbol || item.bseCode,
        ltdCode:    item.bseCode,
        symbol:     item.symbol  || '',
        exchange:   'BSE',
      })
      if (result?.alreadyExists) {
        toast('Already in watchlist', { icon: '⭐' })
      } else {
        toast.success(`${item.scripName || item.bseCode} added to watchlist`)
      }
    } catch (e) {
      toast.error(`Failed: ${e.message}`)
    } finally {
      setAddingToWL(false)
    }
  }

  return (
    <PageTransition className="space-y-6 pb-20">
      
      {/* ── Header Area ── */}
      <div className="glass-panel rounded-2xl p-6 shadow-2xl">
        <label className="block text-xs font-medium text-textMuted mb-2">Search Company</label>
        <div className="flex gap-3">
          <div className="flex-1">
            <ScriptSearchInput
              placeholder="Type company name or BSE/NSE code…"
              onSelect={(item) => item && fetchData(item)}
              onClear={() => { setData(null); setSelected(null); setError(null) }}
            />
          </div>
          {selected && (
            <button onClick={() => fetchData(selected)} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition">
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
              Refresh
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
        <div className="space-y-4 animate-pulse">
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex justify-between">
              <div className="space-y-2"><div className="h-6 w-48 bg-border rounded" /><div className="h-4 w-32 bg-border rounded" /></div>
              <div className="text-right space-y-2"><div className="h-8 w-28 bg-border rounded" /><div className="h-4 w-20 bg-border rounded" /></div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-surface border border-border rounded-xl" />)}
          </div>
          <div className="h-40 bg-surface border border-border rounded-xl" />
        </div>
      )}

      {/* ── Results ── */}
      {data && !loading && (
        <div className="space-y-4">
          {/* Company header */}
          <div className="glass-panel rounded-2xl p-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
              <div>
                <h2 className="text-lg font-bold text-textPrimary leading-tight">
                  {quote?.companyName || item?.scripName}
                </h2>
                {quote?.sector && (
                  <p className="text-xs text-textMuted mt-0.5 mb-2">{quote.sector}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap mt-2">
                  <code className="text-xs font-mono text-textMuted bg-black/20 px-2.5 py-1 rounded-lg border border-white/10 shadow-inner">
                    BSE: {item?.bseCode}
                  </code>
                  {item?.symbol && (
                    <code className="text-xs font-mono text-textMuted bg-black/20 px-2.5 py-1 rounded-lg border border-white/10 shadow-inner">
                      NSE: {item.symbol}
                    </code>
                  )}
                  {item?.isin && (
                    <span className="text-xs text-textMuted">ISIN: {item.isin}</span>
                  )}
                  {item?.type && (
                    <span className="text-xs px-2.5 py-0.5 bg-primary/20 text-primary font-medium rounded-full border border-primary/30">{item.type}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {ltp != null ? (
                  <>
                    <p className="text-4xl font-display font-bold text-textPrimary tabular-nums tracking-tight">₹{fmt(ltp)}</p>
                    {change != null && (
                      <p className={clsx('flex items-center justify-end gap-1.5 text-sm font-semibold px-3 py-1 rounded-full', up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                        {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {up ? '+' : ''}{fmt(change)} ({up ? '+' : ''}{fmt(changePct)}%)
                      </p>
                    )}
                    {prevClose != null && (
                      <p className="text-xs text-textMuted font-medium tracking-wide">Prev close: <span className="text-textPrimary">₹{fmt(prevClose)}</span></p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-textMuted">Price unavailable</p>
                )}
                {/* Watchlist + Alert + Portfolio actions */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {inWatchlist ? (
                    <>
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> In Watchlist
                      </span>
                      <button
                        onClick={() => setAlertScript(inWatchlist)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-semibold transition"
                        title="Set price alert"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        {(inWatchlist.alertAbove || inWatchlist.alertBelow) ? 'Edit Alert' : 'Set Alert'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleAddToWatchlist}
                      disabled={addingToWL}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg text-xs font-semibold transition disabled:opacity-60"
                    >
                      {addingToWL
                        ? <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        : <Star className="w-3.5 h-3.5" />
                      }
                      Add to Watchlist
                    </button>
                  )}
                  {/* Add to Portfolio — navigates to portfolio page with pre-selected script */}
                  <button
                    onClick={() => navigate('/portfolio', {
                      state: { addScript: { bseCode: item?.bseCode, scripName: item?.scripName || quote?.companyName, symbol: item?.symbol || '', isin: item?.isin || '' }, liveQuote: quote ? { ltp: quote.ltp, prevClose: quote.prevClose, open: quote.open, high: quote.high, low: quote.low, change, pctChange: changePct } : null }
                    })}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold transition"
                  >
                    <Briefcase className="w-3.5 h-3.5" /> Add to Portfolio
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Live Price ── */}
          {quote && (
            <Section title="Live Price &amp; OHLC" icon={TrendingUp}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <PriceCard label="Open"       value={display(quote.open,       '₹')} />
                <PriceCard label="High"       value={display(quote.high,       '₹')} color="text-emerald-400" />
                <PriceCard label="Low"        value={display(quote.low,        '₹')} color="text-red-400" />
                <PriceCard label="Prev Close" value={display(quote.prevClose,  '₹')} />
                <PriceCard label="52W High"   value={display(quote.week52High, '₹')} color="text-emerald-400"
                  sub={quote.week52High && ltp ? `${((ltp / quote.week52High - 1) * 100).toFixed(1)}% from high` : undefined} />
                <PriceCard label="52W Low"    value={display(quote.week52Low,  '₹')} color="text-red-400"
                  sub={quote.week52Low && ltp ? `+${((ltp / quote.week52Low - 1) * 100).toFixed(1)}% from low` : undefined} />
              </div>

              {/* 52-week range bar */}
              {quote.week52Low != null && quote.week52High != null && ltp != null && (
                <div className="mt-4 px-1">
                  <div className="flex items-center justify-between text-xs text-textMuted mb-1.5">
                    <span>52W Low <span className="text-red-400 font-semibold">₹{fmt(quote.week52Low)}</span></span>
                    <span className="text-textMuted/60 font-medium">52-Week Range</span>
                    <span>52W High <span className="text-emerald-400 font-semibold">₹{fmt(quote.week52High)}</span></span>
                  </div>
                  <div className="relative h-2 bg-background border border-border rounded-full overflow-hidden">
                    {/* filled range from low to current */}
                    {(() => {
                      const lo = parseFloat(quote.week52Low)
                      const hi = parseFloat(quote.week52High)
                      const cur = parseFloat(ltp)
                      const pct = hi > lo ? Math.min(100, Math.max(0, ((cur - lo) / (hi - lo)) * 100)) : 50
                      return (
                        <>
                          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500/40 to-emerald-500/40 rounded-full" style={{ width: `${pct}%` }} />
                          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-surface shadow" style={{ left: `calc(${pct}% - 6px)` }} />
                        </>
                      )
                    })()}
                  </div>
                  <div className="flex justify-center mt-1.5">
                    <span className="text-[10px] text-primary/70 font-medium">
                      Current ₹{fmt(ltp)} — {(() => {
                        const lo = parseFloat(quote.week52Low)
                        const hi = parseFloat(quote.week52High)
                        const cur = parseFloat(ltp)
                        const pct = hi > lo ? Math.min(100, Math.max(0, ((cur - lo) / (hi - lo)) * 100)) : 50
                        return `${pct.toFixed(0)}% of 52W range`
                      })()}
                    </span>
                  </div>
                </div>
              )}

              {quote.volume != null && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <div className="bg-background border border-border rounded-lg px-4 py-2.5 flex items-center gap-3">
                    <span className="text-xs text-textMuted">Volume</span>
                    <span className="text-sm font-semibold text-textPrimary tabular-nums">
                      {quote.volume != null ? Number(quote.volume).toLocaleString('en-IN') : '—'}
                    </span>
                  </div>
                  {quote.marketCap && (
                    <div className="bg-background border border-border rounded-lg px-4 py-2.5 flex items-center gap-3">
                      <span className="text-xs text-textMuted">Market Cap</span>
                      <span className="text-sm font-semibold text-textPrimary">{quote.marketCap}</span>
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* ── Intraday Chart ── */}
          {(chart?.points?.length > 0 || chart) && (
            <Section title="Today's Price Chart" icon={Activity}>
              <IntradayChart
                points={chart?.points || []}
                prevClose={chart?.prevClose ?? quote?.prevClose}
                current={chart?.current ?? ltp}
              />
              <div className="flex items-center gap-4 mt-2 text-xs text-textMuted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 border-t border-dashed border-gray-500" />
                  Prev Close ₹{fmt(chart?.prevClose ?? quote?.prevClose)}
                </span>
                {chart?.high && <span>Day High: <span className="text-emerald-400 font-semibold">₹{chart.high}</span></span>}
                {chart?.low  && <span>Day Low: <span className="text-red-400 font-semibold">₹{chart.low}</span></span>}
              </div>
            </Section>
          )}

          {/* ── Historical Price Chart ── */}
          <Section title="Historical Price Chart" icon={BarChart2} defaultOpen={true}>
            <div className="flex items-center gap-2 mb-4">
              {HIST_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => handleRangeChange(r.value)}
                  className={clsx(
                    'px-3 py-1 rounded-lg text-xs font-semibold transition',
                    histRange === r.value
                      ? 'bg-primary text-white'
                      : 'bg-background border border-border text-textMuted hover:text-textPrimary hover:border-primary/40'
                  )}
                >{r.label}</button>
              ))}
              {histLoading && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin ml-1" />}
            </div>
            {histData?.points?.length > 0 ? (
              <>
                <HistoricalChart points={histData.points} range={histRange} />
                <div className="flex items-center gap-4 mt-2 text-xs text-textMuted">
                  {histData.points.length > 0 && (() => {
                    const first = histData.points[0]?.close
                    const last  = histData.points[histData.points.length - 1]?.close
                    const chgPct = first && last ? ((last - first) / first * 100) : null
                    return chgPct != null ? (
                      <span className={chgPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}% over this period
                      </span>
                    ) : null
                  })()}
                  <span>{histData.points.length} trading days</span>
                </div>
              </>
            ) : !histLoading ? (
              <p className="text-xs text-textMuted py-4 text-center">Historical data unavailable for this script</p>
            ) : (
              <div className="h-48 bg-border/20 rounded-xl animate-pulse" />
            )}
          </Section>

          {/* ── Historical Data Table ── */}
          {(histTableData?.length > 0 || histTableLoading) && (
            <Section title="Historical Data Table" icon={Calendar} defaultOpen={false}>
              {histTableLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Date', 'Open', 'High', 'Low', 'Close', 'WAP', 'Shares', 'Trades', 'Turnover', 'Del %'].map((h) => (
                          <th key={h} className="text-right px-3 py-2 text-xs font-semibold text-textMuted whitespace-nowrap first:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {histTableData.map((row, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-white/3 transition">
                          <td className="px-3 py-2.5 text-textPrimary font-medium whitespace-nowrap">{row.Dates}</td>
                          <td className="px-3 py-2.5 text-textPrimary tabular-nums text-right">{row.qe_open}</td>
                          <td className="px-3 py-2.5 text-emerald-400 tabular-nums text-right">{row.qe_high}</td>
                          <td className="px-3 py-2.5 text-red-400 tabular-nums text-right">{row.qe_low}</td>
                          <td className="px-3 py-2.5 text-textPrimary font-semibold tabular-nums text-right">{row.qe_close}</td>
                          <td className="px-3 py-2.5 text-textMuted tabular-nums text-right">{row.WeightedPrice}</td>
                          <td className="px-3 py-2.5 text-textMuted tabular-nums text-right">{row.no_of_shrs}</td>
                          <td className="px-3 py-2.5 text-textMuted tabular-nums text-right">{row.no_trades}</td>
                          <td className="px-3 py-2.5 text-textMuted tabular-nums text-right">{row.net_turnov}</td>
                          <td className="px-3 py-2.5 text-primary tabular-nums text-right font-medium">{row.Perc_Del_Qty}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* ── Fundamentals ── */}
          {quote && (
            <Section title="Key Fundamentals" icon={Info}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <PriceCard label="P/E Ratio"  value={display(quote.pe, '', 'x', 1)} />
                <PriceCard label="EPS (₹)"    value={display(quote.eps, '₹')} />
                <PriceCard label="Face Value" value={display(quote.faceValue, '₹', '', 0)} />
                <PriceCard label="Book Value" value={display(quote.bookValue, '₹')} />
                <PriceCard label="Cash EPS"   value={display(quote.cashEps, '₹')} />
                <PriceCard label="OPM %"      value={display(quote.opm, '', '%', 1)} />
                <PriceCard label="NPM %"      value={display(quote.npm, '', '%', 1)} />
                <PriceCard label="RONW %"     value={display(quote.ronw, '', '%', 1)} />
                <PriceCard label="Div. Yield" value={display(quote.dividend, '', '%', 2)} />
                <PriceCard label="52W High"   value={display(quote.week52High, '₹')} color="text-emerald-400" />
                <PriceCard label="52W Low"    value={display(quote.week52Low,  '₹')} color="text-red-400" />
                {quote.marketCap && <PriceCard label="Market Cap" value={quote.marketCap} />}
              </div>
              {[quote.pe, quote.eps, quote.faceValue, quote.week52High, quote.week52Low].every((v) => v == null) && (
                <p className="text-xs text-textMuted mt-3 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Fundamental data not available for this script.
                </p>
              )}
            </Section>
          )}

          {/* ── Peer Comparison ── */}
          {(quote?.peers?.length > 0) && (
            <Section title="Peer Comparison" icon={Layers} defaultOpen={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Company', 'LTP', 'Chg%', 'P/E', 'EPS', '52W H', '52W L', 'FV'].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-textMuted whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Current company row first */}
                    <tr className="border-b border-primary/30 bg-primary/5">
                      <td className="px-3 py-2.5 text-primary font-semibold">{item?.scripName?.split(' ').slice(0,2).join(' ')}</td>
                      <td className="px-3 py-2.5 text-textPrimary tabular-nums font-semibold">₹{fmt(ltp)}</td>
                      <td className={clsx('px-3 py-2.5 tabular-nums font-semibold', up ? 'text-emerald-400' : 'text-red-400')}>
                        {changePct != null ? `${up ? '+' : ''}${fmt(changePct)}%` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-textMuted tabular-nums">{display(quote.pe, '', 'x', 1)}</td>
                      <td className="px-3 py-2.5 text-textMuted tabular-nums">{display(quote.eps, '₹')}</td>
                      <td className="px-3 py-2.5 text-emerald-400 tabular-nums">{display(quote.week52High, '₹')}</td>
                      <td className="px-3 py-2.5 text-red-400 tabular-nums">{display(quote.week52Low, '₹')}</td>
                      <td className="px-3 py-2.5 text-textMuted tabular-nums">{display(quote.faceValue, '₹', '', 0)}</td>
                    </tr>
                    {quote.peers.map((p, i) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-white/3 transition">
                        <td className="px-3 py-2.5 text-textPrimary font-medium">{p.name}</td>
                        <td className="px-3 py-2.5 text-textPrimary tabular-nums">₹{fmt(p.ltp)}</td>
                        <td className={clsx('px-3 py-2.5 tabular-nums', p.change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {p.change != null ? `${p.change >= 0 ? '+' : ''}${fmt(p.change)}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-textMuted tabular-nums">{display(p.pe, '', 'x', 1)}</td>
                        <td className="px-3 py-2.5 text-textMuted tabular-nums">{display(p.eps, '₹')}</td>
                        <td className="px-3 py-2.5 text-emerald-400 tabular-nums">{display(p.w52hi, '₹')}</td>
                        <td className="px-3 py-2.5 text-red-400 tabular-nums">{display(p.w52lo, '₹')}</td>
                        <td className="px-3 py-2.5 text-textMuted tabular-nums">{display(p.faceValue, '₹', '', 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── Quarterly Financials ── */}
          {hasFinancials && (
            <Section title="Quarterly Financials" icon={BarChart2}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Quarter', 'Revenue', 'Net Profit', 'EPS'].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-textMuted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {companyData.financials.slice(0, 8).map((q, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-white/3 transition">
                        <td className="px-3 py-2.5 text-textPrimary font-medium">{q.quarter || '—'}</td>
                        <td className="px-3 py-2.5 text-textMuted tabular-nums">{q.revenue != null ? fmtCr(q.revenue) : '—'}</td>
                        <td className={clsx('px-3 py-2.5 font-semibold tabular-nums',
                          q.profit > 0 ? 'text-emerald-400' : q.profit < 0 ? 'text-red-400' : 'text-textMuted')}>
                          {q.profit != null ? fmtCr(q.profit) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-textMuted tabular-nums">{q.eps != null ? fmt(q.eps) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── Shareholding Pattern ── */}
          {hasShareholding && (
            <Section title="Shareholding Pattern" icon={Users} defaultOpen={true}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-textMuted">Category</th>
                      {(companyData.shareholding.quarters || []).map((q) => (
                        <th key={q} className="text-right px-3 py-2 text-xs font-semibold text-textMuted">{q}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {companyData.shareholding.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-white/3 transition">
                        {row.map((cell, j) => (
                          <td key={j} className={clsx('px-3 py-2',
                            j === 0 ? 'text-textPrimary font-medium' : 'text-right text-textMuted tabular-nums')}>
                            {cell || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {companyData.shareholding.unit && (
                  <p className="text-xs text-textMuted mt-2 opacity-60">{companyData.shareholding.unit}</p>
                )}
              </div>
            </Section>
          )}

          {/* ── Recent Bulk Deals ── */}
          {hasBulkDeals && (
            <Section title="Recent Bulk Deals" icon={Activity} defaultOpen={false}>
              <div className="space-y-2">
                {companyData.bulkDeals.slice(0, 12).map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-background border border-border/50 hover:border-border transition">
                    <div>
                      <p className="text-sm text-textPrimary font-medium">{d.clientName || '—'}</p>
                      <p className="text-xs text-textMuted mt-0.5">{d.dealDate}</p>
                    </div>
                    <div className="text-right">
                      <p className={clsx('text-sm font-semibold',
                        d.transactionType === 'S' || d.transactionType === 'Sell' ? 'text-red-400' : 'text-emerald-400')}>
                        {d.transactionType === 'S' || d.transactionType === 'Sell' ? 'Sell' : 'Buy'}
                        {d.qty != null ? ` ${Number(d.qty).toLocaleString('en-IN')}` : ''}
                      </p>
                      {d.price != null && <p className="text-xs text-textMuted">@ ₹{fmt(d.price)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Delivery & Trading Data ── */}
          {hasQuoteData && (
            <Section title="Trading Data" icon={Percent}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {companyData.quoteData.deliveryPct != null && (
                  <div className="bg-background border border-border rounded-xl p-4">
                    <p className="text-xs text-textMuted mb-1.5">Delivery %</p>
                    <p className="text-base font-bold text-primary">{fmt(companyData.quoteData.deliveryPct)}%</p>
                    <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(companyData.quoteData.deliveryPct, 100)}%` }} />
                    </div>
                  </div>
                )}
                {companyData.quoteData.vwap != null && (
                  <div className="bg-background border border-border rounded-xl p-4">
                    <p className="text-xs text-textMuted mb-1.5">VWAP</p>
                    <p className="text-base font-bold text-textPrimary">₹{fmt(companyData.quoteData.vwap)}</p>
                  </div>
                )}
                {companyData.quoteData.totalTrades != null && (
                  <div className="bg-background border border-border rounded-xl p-4">
                    <p className="text-xs text-textMuted mb-1.5">Total Trades</p>
                    <p className="text-base font-bold text-textPrimary">{Number(companyData.quoteData.totalTrades).toLocaleString('en-IN')}</p>
                  </div>
                )}
                {companyData.quoteData.beta != null && (
                  <div className="bg-background border border-border rounded-xl p-4">
                    <p className="text-xs text-textMuted mb-1.5">Beta</p>
                    <p className={clsx('text-base font-bold', companyData.quoteData.beta > 1 ? 'text-amber-400' : 'text-emerald-400')}>
                      {fmt(companyData.quoteData.beta, 2)}
                    </p>
                  </div>
                )}
                {companyData.quoteData.pbRatio != null && (
                  <div className="bg-background border border-border rounded-xl p-4">
                    <p className="text-xs text-textMuted mb-1.5">P/B Ratio</p>
                    <p className="text-base font-bold text-textPrimary">{fmt(companyData.quoteData.pbRatio, 2)}x</p>
                  </div>
                )}
                {companyData.quoteData.turnover != null && (
                  <div className="bg-background border border-border rounded-xl p-4">
                    <p className="text-xs text-textMuted mb-1.5">Turnover (₹ Cr)</p>
                    <p className="text-base font-bold text-textPrimary">{fmt(companyData.quoteData.turnover, 2)}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ── Promoter / FII / DII Holding ── */}
          {hasHolding && (
            <Section title="Shareholding Breakdown" icon={PieChart}>
              {companyData.holding.quarter && (
                <p className="text-xs text-textMuted mb-4 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  As of {companyData.holding.quarter}
                </p>
              )}
              <div className="space-y-3">
                {[
                  { label: 'Promoter', value: companyData.holding.promoter, color: 'bg-primary', textColor: 'text-primary' },
                  { label: 'FII / FPI', value: companyData.holding.fii,      color: 'bg-blue-500',   textColor: 'text-blue-400' },
                  { label: 'DII',       value: companyData.holding.dii,      color: 'bg-violet-500', textColor: 'text-violet-400' },
                  { label: 'Mutual Funds', value: companyData.holding.mutual, color: 'bg-amber-500', textColor: 'text-amber-400' },
                  { label: 'Public',    value: companyData.holding.public,    color: 'bg-emerald-500',textColor: 'text-emerald-400' },
                ].filter((r) => r.value != null).map(({ label, value, color, textColor }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-28 flex-shrink-0 text-xs text-textMuted">{label}</div>
                    <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                      <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(value, 100)}%` }} />
                    </div>
                    <div className={clsx('w-14 text-right text-sm font-semibold tabular-nums flex-shrink-0', textColor)}>
                      {fmt(value, 2)}%
                    </div>
                  </div>
                ))}
              </div>
              {/* Trend table */}
              {(companyData.holding.history?.length ?? 0) > 1 && (
                <div className="mt-5 overflow-x-auto">
                  <p className="text-xs font-semibold text-textMuted mb-2 uppercase tracking-wider">Historical Trend</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {['Quarter', 'Promoter', 'FII', 'DII', 'Public'].map((h) => (
                          <th key={h} className="text-left px-2 py-1.5 text-textMuted font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {companyData.holding.history.map((h, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-white/2 transition">
                          <td className="px-2 py-1.5 text-textPrimary font-medium">{h.quarter || '—'}</td>
                          <td className="px-2 py-1.5 text-primary tabular-nums">{h.promoter != null ? `${fmt(h.promoter)}%` : '—'}</td>
                          <td className="px-2 py-1.5 text-blue-400 tabular-nums">{h.fii != null ? `${fmt(h.fii)}%` : '—'}</td>
                          <td className="px-2 py-1.5 text-violet-400 tabular-nums">{h.dii != null ? `${fmt(h.dii)}%` : '—'}</td>
                          <td className="px-2 py-1.5 text-emerald-400 tabular-nums">{h.public != null ? `${fmt(h.public)}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* ── Analyst Recommendations ── */}
          {hasAnalystTargets && (
            <Section title="Analyst Recommendations" icon={Target} defaultOpen={false}>
              {(() => {
                const targets = companyData.analystTargets
                const buys    = targets.filter((t) => t.reco === 'BUY'  || t.reco === 'STRONG BUY').length
                const holds   = targets.filter((t) => t.reco === 'HOLD' || t.reco === 'NEUTRAL').length
                const sells   = targets.filter((t) => t.reco === 'SELL' || t.reco === 'STRONG SELL').length
                const total   = targets.length
                const validTargets = targets.filter((t) => t.target != null)
                const avgTarget   = validTargets.length
                  ? validTargets.reduce((s, t) => s + t.target, 0) / validTargets.length
                  : null
                return (
                  <>
                    {/* Consensus summary */}
                    <div className="flex items-center gap-4 mb-5 flex-wrap">
                      {[
                        { label: 'Buy', count: buys,  icon: ThumbsUp,   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                        { label: 'Hold',count: holds, icon: Minus,      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                        { label: 'Sell', count: sells, icon: ThumbsDown, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
                      ].map(({ label, count, icon: Icon, color }) => (
                        <div key={label} className={clsx('flex items-center gap-2.5 px-4 py-2.5 rounded-xl border', color)}>
                          <Icon className="w-4 h-4" />
                          <div>
                            <p className="text-lg font-bold leading-none">{count}</p>
                            <p className="text-xs opacity-70 mt-0.5">{label}</p>
                          </div>
                        </div>
                      ))}
                      {avgTarget != null && ltp != null && (
                        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/5">
                          <Target className="w-4 h-4 text-primary" />
                          <div>
                            <p className="text-lg font-bold text-primary leading-none">₹{fmt(avgTarget)}</p>
                            <p className="text-xs text-textMuted mt-0.5">
                              Avg target · {avgTarget > ltp ? '+' : ''}{(((avgTarget - ltp) / ltp) * 100).toFixed(1)}% upside
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Consensus bar */}
                    {total > 0 && (
                      <div className="flex h-2 rounded-full overflow-hidden mb-5">
                        {buys  > 0 && <div className="bg-emerald-500" style={{ width: `${(buys  / total) * 100}%` }} />}
                        {holds > 0 && <div className="bg-amber-500"   style={{ width: `${(holds / total) * 100}%` }} />}
                        {sells > 0 && <div className="bg-red-500"     style={{ width: `${(sells / total) * 100}%` }} />}
                      </div>
                    )}
                    {/* Individual broker rows */}
                    <div className="space-y-2">
                      {targets.slice(0, 15).map((t, i) => {
                        const isBuy  = t.reco === 'BUY'  || t.reco === 'STRONG BUY'
                        const isSell = t.reco === 'SELL' || t.reco === 'STRONG SELL'
                        return (
                          <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-background border border-border/50 rounded-xl hover:border-border transition">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', isBuy ? 'bg-emerald-500' : isSell ? 'bg-red-500' : 'bg-amber-500')} />
                              <span className="text-sm text-textPrimary font-medium truncate">{t.broker || '—'}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {t.date && <span className="text-xs text-textMuted/60">{t.date}</span>}
                              {t.target != null && <span className="text-sm font-semibold text-textPrimary tabular-nums">₹{fmt(t.target)}</span>}
                              <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full',
                                isBuy  ? 'text-emerald-400 bg-emerald-500/15' :
                                isSell ? 'text-red-400 bg-red-500/15' :
                                         'text-amber-400 bg-amber-500/15')}>
                                {t.reco || '—'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </Section>
          )}

          {/* ── Corporate Actions ── */}
          {hasCorpActions && (
            <Section title="Corporate Actions" icon={Calendar} defaultOpen={false}>
              <div className="space-y-2">
                {companyData.corporateActions.slice(0, 20).map((a, i) => {
                  const purpose = (a.purpose || a.remarks || '').toLowerCase()
                  const isDividend = purpose.includes('dividend') || purpose.includes('div')
                  const isBonus    = purpose.includes('bonus')
                  const isSplit    = purpose.includes('split')
                  const isRights   = purpose.includes('right')
                  const badgeColor = isDividend ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                   : isBonus    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                   : isSplit    ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                                   : isRights   ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
                                   :              'text-textMuted bg-white/5 border-border'
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-background border border-border/50 rounded-xl hover:border-border transition">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Package className="w-3.5 h-3.5 text-textMuted flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-textPrimary truncate">{a.purpose || a.remarks || '—'}</p>
                          {a.remarks && a.remarks !== a.purpose && (
                            <p className="text-xs text-textMuted mt-0.5 truncate">{a.remarks}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {a.exDate && (
                          <span className="text-xs text-textMuted flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Ex: {a.exDate}
                          </span>
                        )}
                        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase', badgeColor)}>
                          {isDividend ? 'Dividend' : isBonus ? 'Bonus' : isSplit ? 'Split' : isRights ? 'Rights' : 'Action'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Per-section unavailability notices */}
          {companyData && !hasHolding && (
            <div className="glass-panel rounded-xl px-5 py-4 flex items-center gap-3 text-xs text-textMuted/60 shadow-inner">
              <Info className="w-4 h-4 flex-shrink-0 text-primary/70" />
              <span><span className="text-textMuted font-medium">Shareholding Breakdown</span> — data currently unavailable from BSE (API returned empty for this script)</span>
            </div>
          )}

          {companyData && !hasCorpActions && (
            <div className="glass-panel rounded-xl px-5 py-4 flex items-center gap-3 text-xs text-textMuted/60 shadow-inner">
              <Info className="w-4 h-4 flex-shrink-0 text-primary/70" />
              <span><span className="text-textMuted font-medium">Corporate Actions</span> — data currently unavailable from BSE</span>
            </div>
          )}
        </div>
      )}

      {/* Price Alert Modal */}
      <SetAlertModal
        script={alertScript}
        rate={alertScript && ltp != null ? { ltp, pctChange: changePct } : null}
        onClose={() => setAlertScript(null)}
        onSaved={() => setAlertScript(null)}
      />

      {/* ── Empty state ── */}
      {!data && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 glass-panel rounded-3xl flex items-center justify-center mb-6 shadow-2xl">
            <Search className="w-10 h-10 text-primary" />
          </div>
          <p className="text-textPrimary font-bold text-xl mb-2 tracking-tight">Search for any BSE-listed company</p>
          <p className="text-sm text-textMuted max-w-sm">
            Type a company name, BSE code, or NSE symbol above to view live price, fundamentals, and filings.
          </p>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-4 text-left max-w-lg w-full">
            {[['₹ Live price', 'Real-time LTP, OHLC'], ['📈 Intraday chart', 'Minute-by-minute price'], ['📊 Fundamentals', 'P/E, EPS, Face Value'], ['👥 Holding', 'Promoter / FII / DII %'], ['🏢 Peer comparison', 'Sector peer table'], ['📋 Bulk Deals', 'Block transactions'], ['🎯 Analyst targets', 'Buy/Hold/Sell + price'], ['📅 Corp. Actions', 'Dividends, splits, bonus']].map(([title, sub]) => (
              <div key={title} className="glass-panel rounded-2xl p-4 hover:-translate-y-1 transition-transform border-t-2 border-t-white/10">
                <p className="text-xs font-bold text-textPrimary tracking-wide">{title}</p>
                <p className="text-[10px] text-textMuted mt-1">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageTransition>
  )
}
