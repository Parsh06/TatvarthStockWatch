import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  Calendar,
  CalendarDays,
  RefreshCw,
  Search,
  Download,
  ExternalLink,
  BarChart2,
  Star,
  Clock,
  Briefcase,
  X,
  ArrowUpDown,
  Filter,
  Sparkles,
  Building2
} from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { exportToXLSX } from '../../utils/csvParser'
import PageTransition from '../Common/PageTransition'
import Loader from '../Common/Loader'
import { useWatchlist } from '../../contexts/WatchlistContext'

// Helper for Indian Standard Time dates
const getISTDate = (d = new Date()) => {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

const todayStr = () => getISTDate()
const addDaysStr = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return getISTDate(d)
}

// Parse date strings like "28 Sep 2026" or "01 Oct 2026" into a timestamp
function parseMeetingDate(dateStr) {
  if (!dateStr) return 0
  const parsed = Date.parse(dateStr)
  if (!isNaN(parsed)) return parsed

  // Fallback for "DD Mon YYYY"
  const parts = dateStr.trim().split(/\s+/)
  if (parts.length === 3) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    }
    const day = parseInt(parts[0], 10)
    const month = months[parts[1].toLowerCase().slice(0, 3)]
    const year = parseInt(parts[2], 10)
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      return new Date(year, month, day).getTime()
    }
  }
  return 0
}

// Get relative day indicator
function getDayBadge(dateStr) {
  const ts = parseMeetingDate(dateStr)
  if (!ts) return null

  const targetDate = new Date(ts)
  const now = new Date()
  // Reset hours to compare calendar days
  targetDate.setHours(0, 0, 0, 0)
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const diffTime = targetDate.getTime() - todayZero.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'short' })

  if (diffDays === 0) {
    return { text: 'Today', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' }
  }
  if (diffDays === 1) {
    return { text: 'Tomorrow', color: 'bg-primary/20 text-primary border-primary/30' }
  }
  if (diffDays > 1 && diffDays <= 7) {
    return { text: `In ${diffDays}d (${dayOfWeek})`, color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' }
  }
  if (diffDays > 7 && diffDays <= 14) {
    return { text: `In ${diffDays}d`, color: 'bg-purple-500/15 text-purple-400 border-purple-500/25' }
  }
  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d ago`, color: 'bg-white/5 text-textMuted border-white/10' }
  }
  return { text: dayOfWeek, color: 'bg-white/5 text-textMuted border-white/10' }
}

function StatCard({ label, value, sub, color = 'text-textPrimary', icon: Icon, iconColor, onClick, active }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "glass-panel hover:-translate-y-1 hover:shadow-premium-hover transition-all duration-300 rounded-2xl p-4 md:p-5 flex items-center gap-3.5 md:gap-4 group relative overflow-hidden",
        onClick && "cursor-pointer",
        active && "ring-2 ring-primary border-primary/40 bg-primary/5"
      )}
    >
      <div className={clsx("absolute -top-10 -right-10 w-24 h-24 blur-3xl opacity-20 rounded-full transition-opacity group-hover:opacity-30", iconColor || 'bg-primary')} />
      {Icon && (
        <div className={clsx('w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner z-10 transition-transform duration-300 group-hover:scale-110', iconColor || 'bg-black/5 dark:bg-white/5')}>
          <Icon className="w-5 h-5 text-primary" />
        </div>
      )}
      <div className="z-10 min-w-0 flex-1">
        <p className="text-[10px] md:text-[11px] font-medium tracking-wider text-textMuted mb-0.5 uppercase truncate">{label}</p>
        <p className={clsx('text-xl md:text-2xl font-bold font-display tabular-nums tracking-tight', color)}>{value}</p>
        {sub && <p className="text-xs text-textMuted mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

export default function ResultCalendarPage() {
  // Filters
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false)
  const [sortBy, setSortBy] = useState('date-asc') // 'date-asc' | 'date-desc' | 'name-asc' | 'code-asc'

  const { scripts: watchlistScripts } = useWatchlist()

  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Watchlist lookup set
  const watchlistCodes = useMemo(() => {
    const set = new Set()
    for (const s of (watchlistScripts || [])) {
      if (s.bseCode) set.add(String(s.bseCode).trim())
      if (s.symbol) set.add(String(s.symbol).trim().toUpperCase())
    }
    return set
  }, [watchlistScripts])

  // Fetch results from backend proxy
  const fetchData = useCallback(async (isRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      let url = '/api/bse/results-calendar'
      const params = []

      if (fromDate) params.push(`fromdate=${fromDate.replace(/-/g, '')}`)
      if (toDate) params.push(`todate=${toDate.replace(/-/g, '')}`)
      if (isRefresh) params.push('refresh=true')

      if (params.length > 0) {
        url += `?${params.join('&')}`
      }

      const res = await apiClient(url)
      const rawList = res?.results || res?.data || (Array.isArray(res) ? res : [])
      const list = rawList.map(item => ({
        scripCode: String(item.scripCode || item.scrip_Code || item.SCRIP_CODE || '').trim(),
        shortName: (item.shortName || item.short_name || item.SHORT_NAME || '').trim(),
        companyName: (item.companyName || item.longName || item.Long_Name || item.short_name || item.shortName || '').trim(),
        meetingDate: (item.meetingDate || item.meeting_date || item.MEETING_DATE || '').trim(),
        url: item.url || item.URL || (item.scripCode || item.scrip_Code ? `https://www.bseindia.com/stock-share-price/-/-/${item.scripCode || item.scrip_Code}/` : '')
      })).filter(i => i.scripCode || i.companyName)

      setResults(list)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[ResultCalendar fetch error]', err)
      setError(err.message || 'Failed to fetch result calendar from BSE.')
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate])

  // Fetch whenever fromDate or toDate changes
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle Preset changes
  const applyPreset = (preset) => {
    setDatePreset(preset)
    if (preset === 'all') {
      setFromDate('')
      setToDate('')
    } else if (preset === 'today') {
      const t = todayStr()
      setFromDate(t)
      setToDate(t)
    } else if (preset === 'week') {
      setFromDate(todayStr())
      setToDate(addDaysStr(7))
    } else if (preset === 'month') {
      setFromDate(todayStr())
      setToDate(addDaysStr(30))
    }
  }

  // Count this week results
  const thisWeekCount = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    return results.filter(item => {
      const ts = parseMeetingDate(item.meetingDate)
      if (!ts) return false
      const d = new Date(ts)
      d.setHours(0, 0, 0, 0)
      return d >= now && d <= sevenDaysLater
    }).length
  }, [results])

  // Count watchlist results
  const watchlistResultsCount = useMemo(() => {
    return results.filter(item => {
      return watchlistCodes.has(String(item.scripCode).trim()) ||
             watchlistCodes.has(String(item.shortName).trim().toUpperCase())
    }).length
  }, [results, watchlistCodes])

  // Filter & Sort
  const filteredResults = useMemo(() => {
    let list = results

    // Watchlist filter
    if (showWatchlistOnly) {
      list = list.filter(item => 
        watchlistCodes.has(String(item.scripCode).trim()) ||
        watchlistCodes.has(String(item.shortName).trim().toUpperCase())
      )
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(item =>
        (item.companyName || '').toLowerCase().includes(q) ||
        (item.scripCode || '').toLowerCase().includes(q) ||
        (item.shortName || '').toLowerCase().includes(q) ||
        (item.meetingDate || '').toLowerCase().includes(q)
      )
    }

    // Sorting
    return [...list].sort((a, b) => {
      if (sortBy === 'date-asc') {
        const tA = parseMeetingDate(a.meetingDate)
        const tB = parseMeetingDate(b.meetingDate)
        if (tA && tB) return tA - tB
        return (a.meetingDate || '').localeCompare(b.meetingDate || '')
      }
      if (sortBy === 'date-desc') {
        const tA = parseMeetingDate(a.meetingDate)
        const tB = parseMeetingDate(b.meetingDate)
        if (tA && tB) return tB - tA
        return (b.meetingDate || '').localeCompare(a.meetingDate || '')
      }
      if (sortBy === 'name-asc') {
        return (a.companyName || '').localeCompare(b.companyName || '')
      }
      if (sortBy === 'code-asc') {
        return (a.scripCode || '').localeCompare(b.scripCode || '')
      }
      return 0
    })
  }, [results, showWatchlistOnly, searchQuery, sortBy, watchlistCodes])

  // Export to Excel
  const handleExport = () => {
    if (!filteredResults.length) return
    const exportData = filteredResults.map(item => ({
      'BSE Code': item.scripCode,
      'Short Name': item.shortName,
      'Company Name': item.companyName,
      'Result / Meeting Date': item.meetingDate,
      'In Watchlist': (watchlistCodes.has(String(item.scripCode).trim()) || watchlistCodes.has(String(item.shortName).trim().toUpperCase())) ? 'Yes' : 'No',
      'BSE URL': item.url
    }))
    const fileName = fromDate && toDate
      ? `BSE_Result_Calendar_${fromDate}_to_${toDate}`
      : `BSE_Forthcoming_Result_Calendar_${todayStr()}`
    exportToXLSX(exportData, fileName)
  }

  return (
    <PageTransition className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-textPrimary flex items-center gap-2">
                Result Calendar
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  BSE
                </span>
              </h1>
              <p className="text-xs md:text-sm text-textMuted mt-0.5">
                Track scheduled quarterly and annual financial result board meetings across listed companies.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs md:text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Refresh from BSE"
          >
            <RefreshCw className={clsx("w-4 h-4 text-textMuted", loading && "animate-spin text-primary")} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={!filteredResults.length}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/25 text-primary rounded-xl text-xs md:text-sm font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Preset Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <span className="text-xs font-medium text-textMuted mr-1 flex items-center gap-1.5 flex-shrink-0">
          <Clock className="w-3.5 h-3.5" /> Presets:
        </span>
        {[
          { key: 'all', label: 'All Forthcoming' },
          { key: 'today', label: 'Today' },
          { key: 'week', label: 'Next 7 Days' },
          { key: 'month', label: 'Next 30 Days' },
        ].map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex-shrink-0 border",
              datePreset === p.key
                ? "bg-primary text-white border-primary shadow-sm shadow-primary/20"
                : "bg-white/5 hover:bg-white/10 text-textMuted hover:text-textPrimary border-white/10"
            )}
          >
            {p.label}
          </button>
        ))}
        {(fromDate || toDate) && (
          <button
            onClick={() => applyPreset('all')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-textMuted hover:text-danger hover:bg-danger/10 border border-dashed border-white/10 transition-all flex items-center gap-1 flex-shrink-0"
          >
            <X className="w-3 h-3" /> Reset Dates
          </button>
        )}
      </div>

      {/* Filter Control Box */}
      <div className="glass-panel rounded-2xl p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 md:gap-4 items-end">
        {/* Search */}
        <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Search</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
            <input
              type="text"
              placeholder="Company name, code, symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/20 dark:bg-black/30 border border-white/10 rounded-xl pl-10 pr-9 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all placeholder:text-textMuted/50 text-textPrimary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* From Date */}
        <div className="lg:col-span-2 space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setDatePreset('custom')
            }}
            className="w-full bg-black/20 dark:bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all text-textPrimary cursor-pointer"
          />
        </div>

        {/* To Date */}
        <div className="lg:col-span-2 space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setDatePreset('custom')
            }}
            className="w-full bg-black/20 dark:bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all text-textPrimary cursor-pointer"
          />
        </div>

        {/* Sort */}
        <div className="lg:col-span-2 space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Sort By</label>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-black/20 dark:bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all text-textPrimary cursor-pointer appearance-none pr-8"
            >
              <option value="date-asc" className="bg-surface text-textPrimary">Date (Nearest first)</option>
              <option value="date-desc" className="bg-surface text-textPrimary">Date (Furthest first)</option>
              <option value="name-asc" className="bg-surface text-textPrimary">Company Name (A-Z)</option>
              <option value="code-asc" className="bg-surface text-textPrimary">BSE Code (0-9)</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 text-textMuted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Watchlist Toggle */}
        <div className="lg:col-span-2 space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider block opacity-0 pointer-events-none">Filter</label>
          <button
            onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
            className={clsx(
              "w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm border",
              showWatchlistOnly
                ? "bg-amber-500/20 border-amber-500/40 text-amber-400 font-semibold"
                : "bg-white/5 border-white/10 text-textMuted hover:text-textPrimary hover:bg-white/10"
            )}
          >
            <Star className={clsx("w-4 h-4", showWatchlistOnly && "fill-amber-400")} />
            <span className="truncate">{showWatchlistOnly ? "My Watchlist" : "All Results"}</span>
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
        <StatCard
          label="Forthcoming Results"
          value={results.length}
          sub={fromDate || toDate ? "In selected range" : "All upcoming from BSE"}
          icon={CalendarCheck}
          iconColor="bg-primary/10 text-primary"
        />
        <StatCard
          label="Filtered Results"
          value={filteredResults.length}
          sub={searchQuery ? `Matching "${searchQuery}"` : "Active view"}
          icon={Filter}
          color={filteredResults.length > 0 ? "text-primary" : "text-textMuted"}
          iconColor="bg-emerald-500/10 text-emerald-400"
        />
        <StatCard
          label="This Week"
          value={thisWeekCount}
          sub="Next 7 days"
          icon={CalendarDays}
          color="text-amber-400"
          iconColor="bg-amber-500/10 text-amber-400"
          onClick={() => applyPreset('week')}
          active={datePreset === 'week'}
        />
        <StatCard
          label="In Watchlist"
          value={watchlistResultsCount}
          sub="Monitored scripts"
          icon={Star}
          color="text-purple-400"
          iconColor="bg-purple-500/10 text-purple-400"
          onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
          active={showWatchlistOnly}
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl p-4 text-sm flex items-start justify-between gap-3">
          <p>{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="text-xs bg-red-500/20 hover:bg-red-500/30 px-3 py-1 rounded-lg text-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Results Table & List */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[420px] shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 flex-1">
            <Loader text="Fetching scheduled results from BSE..." />
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="overflow-x-auto flex-1 scrollbar-hide">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-black/20 dark:bg-black/40 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">BSE Code</th>
                    <th className="px-4 py-3.5 font-semibold">Company Name</th>
                    <th className="px-4 py-3.5 font-semibold">Short Name</th>
                    <th className="px-4 py-3.5 font-semibold">Result / Meeting Date</th>
                    <th className="px-4 py-3.5 font-semibold text-center">Status</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-20 text-center text-textMuted">
                        <div className="max-w-md mx-auto flex flex-col items-center">
                          <Calendar className="w-10 h-10 text-textMuted/40 mb-3 stroke-1" />
                          <p className="text-base font-semibold text-textPrimary">No result meetings found</p>
                          <p className="text-xs text-textMuted mt-1">
                            {showWatchlistOnly
                              ? "None of your watchlist companies have scheduled results for this period."
                              : "No quarterly results scheduled for the selected date range or search query."}
                          </p>
                          {(searchQuery || showWatchlistOnly || fromDate || toDate) && (
                            <button
                              onClick={() => {
                                setSearchQuery('')
                                setShowWatchlistOnly(false)
                                applyPreset('all')
                              }}
                              className="mt-4 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-medium transition-colors"
                            >
                              Clear All Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((item, idx) => {
                      const isWatchlisted = watchlistCodes.has(String(item.scripCode).trim()) ||
                                            watchlistCodes.has(String(item.shortName).trim().toUpperCase())
                      const badge = getDayBadge(item.meetingDate)
                      const bseLink = item.url || `https://www.bseindia.com/stock-share-price/-/${encodeURIComponent(item.shortName || 'stock')}/${item.scripCode}/`

                      return (
                        <tr
                          key={`${item.scripCode}-${idx}`}
                          className="hover:bg-white/[0.04] transition-colors group"
                        >
                          {/* Scrip Code */}
                          <td className="px-4 py-3.5 font-mono text-xs font-semibold text-textMuted group-hover:text-primary transition-colors">
                            <span className="px-2 py-0.5 rounded bg-black/20 dark:bg-white/5 border border-white/5">
                              {item.scripCode}
                            </span>
                          </td>

                          {/* Company Name */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/company-data?code=${item.scripCode}`}
                                className="font-semibold text-textPrimary hover:text-primary transition-colors flex items-center gap-1.5"
                              >
                                {item.companyName}
                              </Link>
                              {isWatchlisted && (
                                <span className="flex-shrink-0" title="In your Watchlist">
                                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Short Name / Symbol */}
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/5 text-textPrimary border border-white/5">
                              {item.shortName || '—'}
                            </span>
                          </td>

                          {/* Meeting Date */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
                              <Calendar className="w-3.5 h-3.5 text-textMuted" />
                              <span>{item.meetingDate}</span>
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="px-4 py-3.5 text-center">
                            {badge ? (
                              <span className={clsx(
                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border",
                                badge.color
                              )}>
                                {badge.text}
                              </span>
                            ) : (
                              <span className="text-xs text-textMuted">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Link
                                to={`/company-data?code=${item.scripCode}`}
                                className="p-1.5 rounded-lg text-textMuted hover:text-primary hover:bg-primary/10 transition-colors"
                                title="View Company Data & Fundamentals"
                              >
                                <BarChart2 className="w-4 h-4" />
                              </Link>
                              <a
                                href={bseLink}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg text-textMuted hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Open BSE Quote Page"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            {filteredResults.length > 0 && (
              <div className="px-4 py-3 border-t border-white/5 bg-black/10 flex flex-col sm:flex-row items-center justify-between text-xs text-textMuted gap-2">
                <span>
                  Showing <strong className="text-textPrimary">{filteredResults.length}</strong> of{' '}
                  <strong className="text-textPrimary">{results.length}</strong> scheduled result meetings
                </span>
                {lastUpdated && (
                  <span className="text-[11px]">
                    Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

    </PageTransition>
  )
}
