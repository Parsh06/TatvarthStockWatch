import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Star, Bell, TrendingUp, Activity, Building2, Plus, BellRing, Crown, TrendingDown, BarChart2, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { format, subDays, isAfter, startOfDay } from 'date-fns'
import clsx from 'clsx'
import { useWatchlist } from '../../contexts/WatchlistContext'
import { useTier } from '../../contexts/TierContext'
import { useAnnouncements } from '../../hooks/useAnnouncements'
import { getAlerts } from '../../services/alertService'
import { useAuth } from '../../contexts/AuthContext'
import AnnouncementCard from '../Announcements/AnnouncementCard'
import toast from 'react-hot-toast'

const PIE_COLORS = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

function StatCard({ label, value, sub, icon: Icon, colorClass, loading }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-textMuted">{label}</span>
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center bg-current/10', colorClass)}>
          <Icon className={clsx('w-4 h-4', colorClass)} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-white/10 rounded animate-pulse" />
      ) : (
        <>
          <span className={clsx('text-3xl font-bold', colorClass)}>{value ?? '—'}</span>
          {sub && <p className="text-xs text-textMuted mt-1 truncate">{sub}</p>}
        </>
      )}
    </div>
  )
}

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-textMuted">{label}</p>
      <p className="text-primary font-semibold">{payload[0].value} announcements</p>
    </div>
  )
}

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="font-medium text-textPrimary">{payload[0].name}</p>
      <p className="text-textMuted">{payload[0].value} announcements</p>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { watchlist, loading: watchlistLoading, addScript } = useWatchlist()
  const { announcements, loading: announcementsLoading, fetch } = useAnnouncements({ watchlist })
  const { isPremium } = useTier()
  const { currentUser } = useAuth()
  const [quickAdd, setQuickAdd]           = useState('')
  const [addingQuick, setAddingQuick]     = useState(false)
  const [alertCount, setAlertCount]       = useState(null)
  const [scriptsWithAlerts, setScriptsWithAlerts] = useState(0)
  const [market, setMarket]               = useState(null)
  const [marketLoading, setMarketLoading] = useState(true)
  const [movers, setMovers]               = useState(null)
  const [moversLoading, setMoversLoading] = useState(true)
  const [moversTab, setMoversTab]         = useState('gainers')
  const [indices, setIndices]             = useState(null)
  const [indicesLoading, setIndicesLoading] = useState(true)

  useEffect(() => {
    getAlerts(currentUser?.uid, 200).then((a) => setAlertCount(a.length)).catch(() => {})
  }, [currentUser])

  function loadMarket() {
    setMarketLoading(true)
    apiClient('/api/bse/market')
      .then((d) => setMarket(d))
      .catch(() => {})
      .finally(() => setMarketLoading(false))
  }

  function loadMovers() {
    setMoversLoading(true)
    apiClient('/api/bse/movers?limit=7')
      .then((d) => setMovers(d))
      .catch(() => {})
      .finally(() => setMoversLoading(false))
  }

  function loadIndices() {
    setIndicesLoading(true)
    apiClient('/api/bse/indices')
      .then((d) => setIndices(d))
      .catch(() => {})
      .finally(() => setIndicesLoading(false))
  }

  useEffect(() => { loadMarket(); loadMovers(); loadIndices() }, [])

  useEffect(() => {
    setScriptsWithAlerts(watchlist.filter((s) => s.alertEnabled && (s.alertAbove != null || s.alertBelow != null)).length)
  }, [watchlist])

  const autoTriggeredRef = useRef(false)
  useEffect(() => {
    if (!watchlistLoading && watchlist.length > 0 && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true
      apiClient('/api/trigger?silent=1', { method: 'POST' }).catch(() => {})
    }
  }, [watchlistLoading, watchlist.length])

  const today   = startOfDay(new Date())
  const last7   = subDays(today, 7)

  // Deduplicate announcements by id — a BSE announcement that also carries an nseSymbol
  // gets stored twice (once per exchange match), so we dedup before counting anything.
  const uniqueAnnouncements = useMemo(() => {
    const seen = new Set()
    return announcements.filter((a) => {
      const id = String(a.id || a.newsId || '')
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [announcements])

  const uniqueWatchlisted = useMemo(() => uniqueAnnouncements.filter((a) => a.isWatchlisted), [uniqueAnnouncements])

  const todayAnn = useMemo(() =>
    uniqueAnnouncements.filter((a) => isAfter(new Date(a.announcementDate || a.date || 0), today)),
  [uniqueAnnouncements, today])

  const weekAnn = useMemo(() =>
    uniqueAnnouncements.filter((a) => isAfter(new Date(a.announcementDate || a.date || 0), last7)),
  [uniqueAnnouncements, last7])

  const bseCount = useMemo(() => uniqueAnnouncements.filter((a) => a.exchange === 'BSE').length, [uniqueAnnouncements])
  const nseCount = useMemo(() => uniqueAnnouncements.filter((a) => a.exchange === 'NSE').length, [uniqueAnnouncements])

  // Most active company — deduplicated watchlisted announcements
  const mostActive = useMemo(() => {
    const counts = {}
    for (const a of uniqueWatchlisted) {
      const name = a.scriptName || a.companyName || a.scriptCode || ''
      if (name) counts[name] = (counts[name] || 0) + 1
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return top ? { name: top[0], count: top[1] } : null
  }, [uniqueWatchlisted])

  // Bar chart — last 7 days (deduplicated)
  const barData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day      = subDays(new Date(), 6 - i)
      const dayStart = startOfDay(day)
      const dayEnd   = startOfDay(subDays(day, -1))
      const count    = uniqueAnnouncements.filter((a) => {
        const d = new Date(a.announcementDate || a.date || 0)
        return d >= dayStart && d < dayEnd
      }).length
      return { day: format(day, 'EEE'), count }
    })
  }, [uniqueAnnouncements])

  // Pie chart — by category (deduplicated)
  const pieData = useMemo(() => {
    const cats = {}
    uniqueAnnouncements.forEach((a) => {
      const cat = (a.category || 'Other').trim()
      cats[cat] = (cats[cat] || 0) + 1
    })
    return Object.entries(cats)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [uniqueAnnouncements])

  // Top companies — deduplicated, group BSE + NSE for the same company under one row
  const topCompanies = useMemo(() => {
    const counts = {}
    for (const a of uniqueWatchlisted) {
      const name = a.scriptName || a.companyName || a.scriptCode || ''
      const exch = a.exchange || 'BSE'
      if (!name) continue
      if (!counts[name]) counts[name] = { name, bseCode: a.bseCode || a.scriptCode || '', symbol: a.nseSymbol || '', total: 0, bse: 0, nse: 0 }
      counts[name].total++
      if (exch === 'NSE') counts[name].nse++
      else counts[name].bse++
    }
    return Object.values(counts).sort((a, b) => b.total - a.total).slice(0, 5)
  }, [uniqueWatchlisted])

  // Groups breakdown
  const groupStats = useMemo(() => {
    const map = {}
    for (const s of watchlist) {
      const g = s.group || ''
      if (!g) continue
      map[g] = (map[g] || 0) + 1
    }
    return Object.entries(map).map(([group, scripts]) => ({ group, scripts })).sort((a, b) => b.scripts - a.scripts).slice(0, 6)
  }, [watchlist])

  async function handleQuickAdd(e) {
    e.preventDefault()
    if (!quickAdd.trim()) return
    setAddingQuick(true)
    try {
      await addScript({ scriptName: quickAdd.trim(), ltdCode: quickAdd.trim(), exchange: 'BOTH' })
      toast.success(`${quickAdd.trim()} added`)
      setQuickAdd('')
    } catch {
      toast.error('Failed to add script')
    } finally {
      setAddingQuick(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-textPrimary">Dashboard</h1>
        <button onClick={() => fetch()} className="text-xs text-primary hover:text-primary/80 transition">Refresh data</button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Watchlisted Scripts" value={watchlist.length}
          icon={Star} colorClass="text-primary" loading={watchlistLoading}
        />
        <StatCard
          label="Today's Announcements" value={todayAnn.length}
          sub={todayAnn.length > 0
            ? `${todayAnn.filter(a => a.exchange === 'BSE').length} BSE · ${todayAnn.filter(a => a.exchange === 'NSE').length} NSE`
            : 'Fetch news to update'}
          icon={Bell} colorClass="text-emerald-400" loading={announcementsLoading}
        />
        <Link to="/alerts" className="block">
          <StatCard
            label="Price Alerts Fired" value={alertCount ?? '—'}
            sub={`${scriptsWithAlerts} scripts have active thresholds`}
            icon={BellRing} colorClass="text-amber-400" loading={alertCount === null}
          />
        </Link>
        <Link to="/premium" className="block">
          <StatCard
            label="Plan" value={isPremium ? 'Premium' : 'Free'}
            sub={isPremium ? 'All features unlocked' : 'Upgrade for price alerts'}
            icon={Crown} colorClass={isPremium ? 'text-amber-400' : 'text-textMuted'} loading={false}
          />
        </Link>
      </div>

      {/* Market Overview */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            BSE Market Overview
          </h2>
          <button onClick={loadMarket} disabled={marketLoading}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition disabled:opacity-60">
            <TrendingUp className={clsx('w-3 h-3', marketLoading && 'animate-pulse')} />
            {marketLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {marketLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
            {[1,2,3,4].map((i) => <div key={i} className="h-16 bg-border rounded-xl" />)}
          </div>
        ) : market ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Sensex */}
            {market.sensex != null && (
              <div className="bg-background border border-border rounded-xl p-4">
                <p className="text-xs text-textMuted mb-1">Sensex</p>
                <p className="text-base font-bold text-textPrimary tabular-nums">
                  {Number(market.sensex).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
                {market.sensexChg != null && (
                  <p className={clsx('text-xs font-medium mt-0.5 flex items-center gap-1', market.sensexChg >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {market.sensexChg >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {market.sensexChg >= 0 ? '+' : ''}{market.sensexChg.toFixed(2)}
                    {market.sensexPct != null && ` (${market.sensexChg >= 0 ? '+' : ''}${market.sensexPct.toFixed(2)}%)`}
                  </p>
                )}
              </div>
            )}
            {/* Advances */}
            {market.advances != null && (
              <div className="bg-background border border-border rounded-xl p-4">
                <p className="text-xs text-textMuted mb-1">Advances</p>
                <p className="text-base font-bold text-emerald-400 tabular-nums">{market.advances}</p>
                {market.declines != null && (
                  <p className="text-xs text-textMuted mt-0.5">
                    vs <span className="text-red-400">{market.declines}</span> declines
                  </p>
                )}
              </div>
            )}
            {/* Declines */}
            {market.declines != null && market.advances != null && (
              <div className="bg-background border border-border rounded-xl p-4">
                <p className="text-xs text-textMuted mb-2">A/D Ratio</p>
                <div className="flex h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 transition-all"
                    style={{ width: `${(market.advances / (market.advances + market.declines + (market.unchanged || 0))) * 100}%` }} />
                  {market.unchanged > 0 && (
                    <div className="bg-amber-500 transition-all"
                      style={{ width: `${(market.unchanged / (market.advances + market.declines + market.unchanged)) * 100}%` }} />
                  )}
                  <div className="bg-red-500 flex-1 transition-all" />
                </div>
                <p className="text-xs text-textMuted mt-1.5 tabular-nums">
                  {market.advances} · {market.unchanged ?? 0} · {market.declines}
                </p>
              </div>
            )}
            {/* Turnover */}
            {market.turnover != null && (
              <div className="bg-background border border-border rounded-xl p-4">
                <p className="text-xs text-textMuted mb-1">Turnover</p>
                <p className="text-base font-bold text-textPrimary tabular-nums">
                  ₹{(market.turnover / 100).toFixed(0)} Cr
                </p>
                <p className="text-xs text-textMuted mt-0.5">BSE total today</p>
              </div>
            )}
            {/* Fallback when API returned no data */}
            {market.advances == null && market.sensex == null && (
              <div className="col-span-4 text-sm text-textMuted text-center py-4">
                Market data unavailable
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-textMuted text-center py-4">Could not load market data</p>
        )}
      </div>

      {/* BSE Indices */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            BSE Indices
          </h2>
          <button onClick={loadIndices} disabled={indicesLoading}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition disabled:opacity-60">
            <RefreshCw className={clsx('w-3 h-3', indicesLoading && 'animate-spin')} />
            {indicesLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {indicesLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 animate-pulse">
            {[1,2,3,4,5,6].map((i) => <div key={i} className="h-[88px] bg-border rounded-xl" />)}
          </div>
        ) : indices?.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {indices.map((idx, i) => {
              const pchg = parseFloat((idx.perchg || '').replace(/,/g, ''));
              const isUp = pchg >= 0;
              return (
                <div key={i} className="bg-background border border-border rounded-xl p-3.5 hover:border-primary/30 transition-colors">
                  <p className="text-xs text-textMuted mb-1 truncate" title={idx.indxnm}>{idx.indxnm}</p>
                  <p className="text-sm font-bold text-textPrimary tabular-nums">
                    {idx.ltp}
                  </p>
                  <p className={clsx('text-[11px] font-medium mt-1 flex items-center gap-1', isUp ? 'text-emerald-400' : 'text-red-400')}>
                    {isUp ? <TrendingUp className="w-3 h-3 flex-shrink-0" /> : <TrendingDown className="w-3 h-3 flex-shrink-0" />}
                    <span className="truncate">{idx.chg} ({idx.perchg}%)</span>
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-textMuted text-center py-4">Could not load indices data</p>
        )}
      </div>

      {/* Exchange breakdown bar */}
      {(bseCount + nseCount) > 0 && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-textPrimary mb-3">Exchange Breakdown</h2>
          <div className="flex items-center gap-6">
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-textMuted">BSE</span>
                <span className="font-semibold text-blue-400">{bseCount}</span>
              </div>
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(bseCount / (bseCount + nseCount)) * 100}%` }} />
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-textMuted">NSE</span>
                <span className="font-semibold text-orange-400">{nseCount}</span>
              </div>
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all"
                  style={{ width: `${(nseCount / (bseCount + nseCount)) * 100}%` }} />
              </div>
            </div>
            <span className="text-sm font-bold text-textPrimary whitespace-nowrap">{bseCount + nseCount} total</span>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-textPrimary mb-4">Announcements — Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} barSize={28}>
              <XAxis dataKey="day" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(14,165,233,0.05)' }} />
              <Bar dataKey="count" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-textPrimary mb-4">By Category</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-textMuted text-sm">No data yet — fetch announcements first</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top companies + Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-textPrimary mb-4">Top Companies by Announcements</h2>
          {topCompanies.length === 0 ? (
            <p className="text-sm text-textMuted py-6 text-center">No watchlist announcements yet</p>
          ) : (
            <div className="space-y-3">
              {topCompanies.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-textMuted/40 w-4 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => c.bseCode && navigate('/company-data', { state: { script: { bseCode: c.bseCode, scripName: c.name, symbol: c.symbol } } })}
                      className="text-sm text-textPrimary truncate font-medium hover:text-primary transition text-left w-full block"
                    >{c.name}</button>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {c.bse > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/15 text-blue-400 rounded font-semibold">{c.bse} BSE</span>}
                      {c.nse > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/15 text-orange-400 rounded font-semibold">{c.nse} NSE</span>}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-amber-400">{c.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-textPrimary">Watchlist Groups</h2>
            <span className="text-xs text-textMuted">{groupStats.length} groups</span>
          </div>
          {groupStats.length === 0 ? (
            <div className="py-6 text-center">
              <Building2 className="w-8 h-8 text-textMuted/30 mx-auto mb-2" />
              <p className="text-sm text-textMuted">No groups yet</p>
              <p className="text-xs text-textMuted/60 mt-1">Assign a Group when adding scripts to organise by sector</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupStats.map((g) => {
                const pct = watchlist.length > 0 ? Math.round((g.scripts / watchlist.length) * 100) : 0
                return (
                  <div key={g.group}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-textPrimary font-medium">{g.group}</span>
                      <span className="text-textMuted">{g.scripts} scripts · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-background rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Gainers / Losers */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-background rounded-lg p-0.5 border border-border">
            {['gainers', 'losers'].map((tab) => (
              <button
                key={tab}
                onClick={() => setMoversTab(tab)}
                className={clsx(
                  'px-4 py-1.5 rounded-md text-xs font-semibold transition capitalize',
                  moversTab === tab
                    ? tab === 'gainers'
                      ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                      : 'bg-red-500/20 text-red-400 shadow-sm'
                    : 'text-textMuted hover:text-textPrimary'
                )}
              >
                {tab === 'gainers' ? '▲ Top Gainers' : '▼ Top Losers'}
              </button>
            ))}
          </div>
          <button
            onClick={loadMovers} disabled={moversLoading}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-60 transition"
          >
            <RefreshCw className={clsx('w-3 h-3', moversLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {moversLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="w-4 h-3 bg-border rounded" />
                <div className="flex-1 h-3 bg-border rounded" />
                <div className="w-16 h-3 bg-border rounded" />
                <div className="w-14 h-3 bg-border rounded" />
              </div>
            ))}
          </div>
        ) : !movers || (moversTab === 'gainers' ? movers.gainers : movers.losers)?.length === 0 ? (
          <div className="text-center py-6 text-sm text-textMuted">
            Market data currently unavailable
            <br /><button onClick={loadMovers} className="text-xs text-primary mt-2 block mx-auto hover:text-primary/80 transition">Try again</button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {(moversTab === 'gainers' ? movers.gainers : movers.losers).map((m, i) => {
                const up = (m.pctChange ?? 0) >= 0
                return (
                  <button
                    key={m.bseCode}
                    onClick={() => m.bseCode && navigate('/company-data', { state: { script: { bseCode: m.bseCode, scripName: m.company, symbol: m.symbol } } })}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] transition text-left group"
                  >
                    <span className="text-xs font-bold text-textMuted/40 w-4 text-center flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-textPrimary truncate group-hover:text-primary transition">{m.company}</p>
                      <p className="text-[11px] font-mono text-textMuted/50">{m.bseCode}{m.symbol ? ` · ${m.symbol}` : ''}</p>
                    </div>
                    {m.ltp != null && (
                      <p className="text-sm font-bold text-textPrimary tabular-nums flex-shrink-0">
                        ₹{m.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </p>
                    )}
                    {m.pctChange != null && (
                      <span className={clsx(
                        'flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg flex-shrink-0',
                        up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      )}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {up ? '+' : ''}{m.pctChange.toFixed(2)}%
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {movers.fetchedAt && (
              <p className="text-[11px] text-textMuted/40 mt-3 text-right">
                BSE data · {new Date(movers.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                {movers.cached ? ' (cached)' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {/* Quick add */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-textPrimary mb-3">Quick Add Script</h2>
        <form onSubmit={handleQuickAdd} className="flex gap-3">
          <input
            type="text"
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            placeholder="Enter script name or LTD code…"
            className="flex-1 bg-background border border-border rounded-lg px-4 py-2.5 text-textPrimary placeholder-textMuted/50 focus:outline-none focus:ring-1 focus:ring-primary text-sm"
          />
          <button
            type="submit"
            disabled={addingQuick || !quickAdd.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
          >
            {addingQuick ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </form>
      </div>

      {/* Recent announcements */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-textPrimary">Recent Watchlist Announcements</h2>
          <button onClick={() => fetch()} className="text-xs text-primary hover:text-primary/80 transition">Refresh</button>
        </div>
        {announcementsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4 flex gap-3">
                <div className="w-1 rounded h-16 bg-white/10 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 bg-white/10 rounded animate-pulse" />
                  <div className="h-4 w-full bg-white/10 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-white/10 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : uniqueWatchlisted.length === 0 ? (
          <div className="text-center py-8 text-textMuted text-sm bg-surface border border-border rounded-xl">
            No watchlist announcements yet. Go to <strong>Watchlist → Fetch News</strong>.
          </div>
        ) : (
          <div className="space-y-3">
            {uniqueWatchlisted.slice(0, 5).map((a, i) => <AnnouncementCard key={i} announcement={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}
