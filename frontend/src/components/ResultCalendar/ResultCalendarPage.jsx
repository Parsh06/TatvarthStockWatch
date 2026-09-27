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
  FileText,
  Building2,
  CheckCircle2,
  Layers,
  Sparkles,
  ChevronRight,
  TrendingUp,
  FileCode2
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

// Helper for relative day badge in calendar view
function getDayBadge(dateStr) {
  const ts = parseMeetingDate(dateStr)
  if (!ts) return null

  const targetDate = new Date(ts)
  const now = new Date()
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

// Helper to format Quarter Code (e.g. JQ2026-2027 -> Q1 FY27, MQ2025-2026 -> Q4 FY26)
function formatQuarterCode(code) {
  if (!code) return '—'
  const c = code.toUpperCase()
  let qtr = ''
  if (c.startsWith('JQ')) qtr = 'Q1'
  else if (c.startsWith('SQ')) qtr = 'Q2'
  else if (c.startsWith('DQ')) qtr = 'Q3'
  else if (c.startsWith('MQ')) qtr = 'Q4'
  else if (c.startsWith('SH') || c.startsWith('FH')) qtr = 'H1'
  else if (c.startsWith('MH') || c.startsWith('LH')) qtr = 'H2'
  else if (c.startsWith('MC')) qtr = 'Annual'

  const yrMatch = c.match(/(\d{4})-(\d{4})/)
  if (yrMatch && qtr) {
    return `${qtr} FY${yrMatch[2].slice(-2)}`
  }
  return code
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
  // Main active view mode: 'calendar' (Forthcoming result meetings) vs 'declared' (Declared financial results)
  const [activeTab, setActiveTab] = useState('calendar') // 'calendar' | 'declared'

  // ── Calendar View Filters ──────────────────────────────────────────────────
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false)
  const [sortBy, setSortBy] = useState('date-asc')

  // ── Declared Financial Results Filters ─────────────────────────────────────
  const [declaredAuditFilter, setDeclaredAuditFilter] = useState('all') // 'all' | 'Audited' | 'Unaudited'
  const [declaredNatureFilter, setDeclaredNatureFilter] = useState('all') // 'all' | 'Standalone' | 'Consolidated'
  const [declaredIndustryFilter, setDeclaredIndustryFilter] = useState('all')

  const { scripts: watchlistScripts } = useWatchlist()

  // State
  const [calendarResults, setCalendarResults] = useState([])
  const [declaredResults, setDeclaredResults] = useState([])
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [loadingDeclared, setLoadingDeclared] = useState(false)
  const [calendarError, setCalendarError] = useState(null)
  const [declaredError, setDeclaredError] = useState(null)
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

  // 1. Fetch Forthcoming Results Calendar
  const fetchCalendarData = useCallback(async (isRefresh = false) => {
    setLoadingCalendar(true)
    setCalendarError(null)
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

      setCalendarResults(list)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[ResultCalendar fetch error]', err)
      setCalendarError(err.message || 'Failed to fetch result calendar from BSE.')
    } finally {
      setLoadingCalendar(false)
    }
  }, [fromDate, toDate])

  // 2. Fetch Declared Financial Results
  const fetchDeclaredData = useCallback(async (isRefresh = false) => {
    setLoadingDeclared(true)
    setDeclaredError(null)
    try {
      let url = '/api/bse/financial-results?segment=C&FlagDur=1'
      if (isRefresh) url += '&refresh=true'

      const res = await apiClient(url)
      const rawList = res?.results || res?.data || (Array.isArray(res) ? res : [])
      const list = rawList.map(item => ({
        scripCode: String(item.scripCode || item.Scrip_cd || item.SCRIP_CODE || '').trim(),
        companyName: (item.companyName || item.company_name || item.scrip_name || '').trim(),
        shortName: (item.shortName || item.scrip_name || item.short_name || '').trim(),
        quarterCode: (item.quarterCode || item.quarter_code || '').trim(),
        audited: (item.audited || 'Unaudited').trim(),
        dtTm: (item.dtTm || item.DT_TM || '').trim(),
        createDate: item.createDate || item.Fld_CreateDate || '',
        industryName: (item.industryName || item.Industry_name || 'General').trim(),
        natureOfReport: (item.natureOfReport || item.Fld_NatureOfReport || 'Standalone').trim(),
        xmlName: item.xmlName || item.XMLName || '',
        consolXmlName: item.consolXmlName || item.Consol_XMLName || '',
        resultPageUrl: item.resultPageUrl || item.Resultpageurl || '',
        url: item.url || item.URL || (item.scripCode || item.Scrip_cd ? `https://www.bseindia.com/stock-share-price/-/-/${item.scripCode || item.Scrip_cd}/` : '')
      })).filter(i => i.scripCode || i.companyName)

      setDeclaredResults(list)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[FinancialResults fetch error]', err)
      setDeclaredError(err.message || 'Failed to fetch declared financial results.')
    } finally {
      setLoadingDeclared(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchCalendarData()
    fetchDeclaredData()
  }, [fetchCalendarData, fetchDeclaredData])

  // Handle Preset changes for Calendar
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

  // ── Calendar Computed Stats ───────────────────────────────────────────────
  const thisWeekCount = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    return calendarResults.filter(item => {
      const ts = parseMeetingDate(item.meetingDate)
      if (!ts) return false
      const d = new Date(ts)
      d.setHours(0, 0, 0, 0)
      return d >= now && d <= sevenDaysLater
    }).length
  }, [calendarResults])

  const watchlistCalendarCount = useMemo(() => {
    return calendarResults.filter(item => {
      return watchlistCodes.has(String(item.scripCode).trim()) ||
             watchlistCodes.has(String(item.shortName).trim().toUpperCase())
    }).length
  }, [calendarResults, watchlistCodes])

  // Filtered Calendar Results
  const filteredCalendarResults = useMemo(() => {
    let list = calendarResults

    if (showWatchlistOnly) {
      list = list.filter(item => 
        watchlistCodes.has(String(item.scripCode).trim()) ||
        watchlistCodes.has(String(item.shortName).trim().toUpperCase())
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(item =>
        (item.companyName || '').toLowerCase().includes(q) ||
        (item.scripCode || '').toLowerCase().includes(q) ||
        (item.shortName || '').toLowerCase().includes(q) ||
        (item.meetingDate || '').toLowerCase().includes(q)
      )
    }

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
  }, [calendarResults, showWatchlistOnly, searchQuery, sortBy, watchlistCodes])

  // ── Declared Results Computed Stats & Filters ──────────────────────────────
  const declaredIndustries = useMemo(() => {
    const set = new Set()
    for (const item of declaredResults) {
      if (item.industryName) set.add(item.industryName)
    }
    return Array.from(set).sort()
  }, [declaredResults])

  const declaredAuditedCount = useMemo(() => {
    return declaredResults.filter(item => (item.audited || '').toLowerCase() === 'audited').length
  }, [declaredResults])

  const declaredWatchlistCount = useMemo(() => {
    return declaredResults.filter(item => {
      return watchlistCodes.has(String(item.scripCode).trim()) ||
             watchlistCodes.has(String(item.shortName).trim().toUpperCase())
    }).length
  }, [declaredResults, watchlistCodes])

  const filteredDeclaredResults = useMemo(() => {
    let list = declaredResults

    if (showWatchlistOnly) {
      list = list.filter(item => 
        watchlistCodes.has(String(item.scripCode).trim()) ||
        watchlistCodes.has(String(item.shortName).trim().toUpperCase())
      )
    }

    if (declaredAuditFilter !== 'all') {
      list = list.filter(item => (item.audited || '').toLowerCase() === declaredAuditFilter.toLowerCase())
    }

    if (declaredNatureFilter !== 'all') {
      list = list.filter(item => (item.natureOfReport || '').toLowerCase() === declaredNatureFilter.toLowerCase())
    }

    if (declaredIndustryFilter !== 'all') {
      list = list.filter(item => item.industryName === declaredIndustryFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(item =>
        (item.companyName || '').toLowerCase().includes(q) ||
        (item.scripCode || '').toLowerCase().includes(q) ||
        (item.shortName || '').toLowerCase().includes(q) ||
        (item.industryName || '').toLowerCase().includes(q) ||
        (item.quarterCode || '').toLowerCase().includes(q)
      )
    }

    return [...list].sort((a, b) => {
      // Sort newest first by createDate or dtTm
      const tA = a.createDate ? Date.parse(a.createDate) : 0
      const tB = b.createDate ? Date.parse(b.createDate) : 0
      if (tA && tB) return tB - tA
      return (b.dtTm || '').localeCompare(a.dtTm || '')
    })
  }, [declaredResults, showWatchlistOnly, declaredAuditFilter, declaredNatureFilter, declaredIndustryFilter, searchQuery, watchlistCodes])

  // Export to Excel
  const handleExport = () => {
    if (activeTab === 'calendar') {
      if (!filteredCalendarResults.length) return
      const exportData = filteredCalendarResults.map(item => ({
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
    } else {
      if (!filteredDeclaredResults.length) return
      const exportData = filteredDeclaredResults.map(item => ({
        'BSE Code': item.scripCode,
        'Company Name': item.companyName,
        'Industry': item.industryName,
        'Quarter': formatQuarterCode(item.quarterCode),
        'Quarter Code': item.quarterCode,
        'Audit Status': item.audited,
        'Nature of Report': item.natureOfReport,
        'Announced On': item.dtTm,
        'In Watchlist': (watchlistCodes.has(String(item.scripCode).trim()) || watchlistCodes.has(String(item.shortName).trim().toUpperCase())) ? 'Yes' : 'No',
        'BSE URL': item.url
      }))
      exportToXLSX(exportData, `BSE_Declared_Financial_Results_${todayStr()}`)
    }
  }

  const isLoading = activeTab === 'calendar' ? loadingCalendar : loadingDeclared
  const activeError = activeTab === 'calendar' ? calendarError : declaredError

  return (
    <PageTransition className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              {activeTab === 'calendar' ? <CalendarCheck className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-textPrimary flex items-center gap-2">
                {activeTab === 'calendar' ? 'Financial Results Calendar' : 'Declared Financial Results'}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  BSE
                </span>
              </h1>
              <p className="text-xs md:text-sm text-textMuted mt-0.5">
                {activeTab === 'calendar'
                  ? 'Track scheduled forthcoming quarterly and annual financial result meetings.'
                  : 'Real-time feed of newly declared quarterly & annual financial results.'}
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => {
              if (activeTab === 'calendar') fetchCalendarData(true)
              else fetchDeclaredData(true)
            }}
            disabled={isLoading}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs md:text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50 text-textPrimary"
            title="Refresh from BSE"
          >
            <RefreshCw className={clsx("w-4 h-4 text-textMuted", isLoading && "animate-spin text-primary")} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={activeTab === 'calendar' ? !filteredCalendarResults.length : !filteredDeclaredResults.length}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/25 text-primary rounded-xl text-xs md:text-sm font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Primary Mode Switch Bar (Presets + Mode Switch Button) */}
      <div className="glass-panel rounded-2xl p-2 md:p-2.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border border-white/10 shadow-sm">
        
        {/* Left Side: Preset Chips (in calendar mode) or Filters Summary (in declared mode) */}
        {activeTab === 'calendar' ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide px-1">
            <span className="text-xs font-semibold text-textMuted mr-1 flex items-center gap-1.5 flex-shrink-0 uppercase tracking-wider text-[10px]">
              <Clock className="w-3.5 h-3.5 text-primary" /> Presets:
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
                    ? "bg-primary text-white border-primary shadow-sm shadow-primary/20 font-semibold"
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
                <X className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide px-1">
            <span className="text-xs font-semibold text-textMuted mr-1 flex items-center gap-1.5 flex-shrink-0 uppercase tracking-wider text-[10px]">
              <Layers className="w-3.5 h-3.5 text-emerald-400" /> Filter:
            </span>
            {[
              { key: 'all', label: 'All Reports' },
              { key: 'Audited', label: 'Audited Only' },
              { key: 'Unaudited', label: 'Unaudited' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setDeclaredAuditFilter(p.key)}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex-shrink-0 border",
                  declaredAuditFilter === p.key
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold shadow-sm"
                    : "bg-white/5 hover:bg-white/10 text-textMuted hover:text-textPrimary border-white/10"
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="h-4 w-px bg-white/10 mx-1 flex-shrink-0" />
            {[
              { key: 'all', label: 'All Nature' },
              { key: 'Standalone', label: 'Standalone' },
              { key: 'Consolidated', label: 'Consolidated' },
            ].map(n => (
              <button
                key={n.key}
                onClick={() => setDeclaredNatureFilter(n.key)}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex-shrink-0 border",
                  declaredNatureFilter === n.key
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40 font-semibold shadow-sm"
                    : "bg-white/5 hover:bg-white/10 text-textMuted hover:text-textPrimary border-white/10"
                )}
              >
                {n.label}
              </button>
            ))}
          </div>
        )}

        {/* Right Side: High-Visibility View Switcher Button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeTab === 'calendar' ? (
            <button
              onClick={() => setActiveTab('declared')}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs md:text-sm font-semibold transition-all shadow-sm active:scale-95 group"
            >
              <FileText className="w-4 h-4 transition-transform group-hover:scale-110" />
              <span>See Financial Results</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('calendar')}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary rounded-xl text-xs md:text-sm font-semibold transition-all shadow-sm active:scale-95 group"
            >
              <CalendarCheck className="w-4 h-4 transition-transform group-hover:scale-110" />
              <span>Show Result Calendar</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>
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
              placeholder={activeTab === 'calendar' ? "Company, code, symbol..." : "Company, industry, quarter, code..."}
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

        {/* View-Specific Filters */}
        {activeTab === 'calendar' ? (
          <>
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
          </>
        ) : (
          <>
            {/* Industry Filter */}
            <div className="lg:col-span-3 space-y-1.5">
              <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Industry</label>
              <select
                value={declaredIndustryFilter}
                onChange={(e) => setDeclaredIndustryFilter(e.target.value)}
                className="w-full bg-black/20 dark:bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all text-textPrimary cursor-pointer truncate"
              >
                <option value="all" className="bg-surface text-textPrimary">All Industries ({declaredIndustries.length})</option>
                {declaredIndustries.map(ind => (
                  <option key={ind} value={ind} className="bg-surface text-textPrimary">{ind}</option>
                ))}
              </select>
            </div>

            {/* Quick Status View */}
            <div className="lg:col-span-3 space-y-1.5">
              <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Report Segment</label>
              <div className="w-full bg-black/20 dark:bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-textMuted flex items-center justify-between">
                <span>Segment C (Equities)</span>
                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-textPrimary">Live BSE</span>
              </div>
            </div>
          </>
        )}

        {/* Watchlist Toggle */}
        <div className={clsx("space-y-1.5", activeTab === 'calendar' ? 'lg:col-span-2' : 'lg:col-span-2')}>
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

      {/* KPI Stat Cards */}
      {activeTab === 'calendar' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
          <StatCard
            label="Forthcoming Results"
            value={calendarResults.length}
            sub={fromDate || toDate ? "In selected range" : "All upcoming from BSE"}
            icon={CalendarCheck}
            iconColor="bg-primary/10 text-primary"
          />
          <StatCard
            label="Filtered Results"
            value={filteredCalendarResults.length}
            sub={searchQuery ? `Matching "${searchQuery}"` : "Active view"}
            icon={Filter}
            color={filteredCalendarResults.length > 0 ? "text-primary" : "text-textMuted"}
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
            value={watchlistCalendarCount}
            sub="Monitored scripts"
            icon={Star}
            color="text-purple-400"
            iconColor="bg-purple-500/10 text-purple-400"
            onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
            active={showWatchlistOnly}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
          <StatCard
            label="Total Declared"
            value={declaredResults.length}
            sub="Recent filings"
            icon={FileText}
            iconColor="bg-emerald-500/10 text-emerald-400"
          />
          <StatCard
            label="Filtered Results"
            value={filteredDeclaredResults.length}
            sub={searchQuery ? `Matching "${searchQuery}"` : "Active view"}
            icon={Filter}
            color={filteredDeclaredResults.length > 0 ? "text-primary" : "text-textMuted"}
            iconColor="bg-primary/10 text-primary"
          />
          <StatCard
            label="Audited Reports"
            value={declaredAuditedCount}
            sub="Verified financials"
            icon={CheckCircle2}
            color="text-emerald-400"
            iconColor="bg-emerald-500/10 text-emerald-400"
            onClick={() => setDeclaredAuditFilter(prev => prev === 'Audited' ? 'all' : 'Audited')}
            active={declaredAuditFilter === 'Audited'}
          />
          <StatCard
            label="In Watchlist"
            value={declaredWatchlistCount}
            sub="Monitored scripts"
            icon={Star}
            color="text-purple-400"
            iconColor="bg-purple-500/10 text-purple-400"
            onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
            active={showWatchlistOnly}
          />
        </div>
      )}

      {/* Error state */}
      {activeError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl p-4 text-sm flex items-start justify-between gap-3">
          <p>{activeError}</p>
          <button
            onClick={() => {
              if (activeTab === 'calendar') fetchCalendarData(true)
              else fetchDeclaredData(true)
            }}
            className="text-xs bg-red-500/20 hover:bg-red-500/30 px-3 py-1 rounded-lg text-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[420px] shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 flex-1">
            <Loader text={activeTab === 'calendar' ? "Fetching forthcoming results..." : "Fetching declared financial results..."} />
          </div>
        ) : (
          <>
            {/* VIEW 1: Forthcoming Results Calendar Table */}
            {activeTab === 'calendar' && (
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
                    {filteredCalendarResults.length === 0 ? (
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
                      filteredCalendarResults.map((item, idx) => {
                        const isWatchlisted = watchlistCodes.has(String(item.scripCode).trim()) ||
                                              watchlistCodes.has(String(item.shortName).trim().toUpperCase())
                        const badge = getDayBadge(item.meetingDate)
                        const bseLink = item.url || `https://www.bseindia.com/stock-share-price/-/${encodeURIComponent(item.shortName || 'stock')}/${item.scripCode}/`

                        return (
                          <tr
                            key={`${item.scripCode}-${idx}`}
                            className="hover:bg-white/[0.04] transition-colors group"
                          >
                            <td className="px-4 py-3.5 font-mono text-xs font-semibold text-textMuted group-hover:text-primary transition-colors">
                              <span className="px-2 py-0.5 rounded bg-black/20 dark:bg-white/5 border border-white/5">
                                {item.scripCode}
                              </span>
                            </td>

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

                            <td className="px-4 py-3.5">
                              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/5 text-textPrimary border border-white/5">
                                {item.shortName || '—'}
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
                                <Calendar className="w-3.5 h-3.5 text-textMuted" />
                                <span>{item.meetingDate}</span>
                              </div>
                            </td>

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
            )}

            {/* VIEW 2: Declared Financial Results Table */}
            {activeTab === 'declared' && (
              <div className="overflow-x-auto flex-1 scrollbar-hide">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-black/20 dark:bg-black/40 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
                    <tr>
                      <th className="px-4 py-3.5 font-semibold">BSE Code</th>
                      <th className="px-4 py-3.5 font-semibold">Company Name</th>
                      <th className="px-4 py-3.5 font-semibold">Industry</th>
                      <th className="px-4 py-3.5 font-semibold">Quarter / Period</th>
                      <th className="px-4 py-3.5 font-semibold text-center">Status & Nature</th>
                      <th className="px-4 py-3.5 font-semibold">Announced At</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredDeclaredResults.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-20 text-center text-textMuted">
                          <div className="max-w-md mx-auto flex flex-col items-center">
                            <FileText className="w-10 h-10 text-textMuted/40 mb-3 stroke-1" />
                            <p className="text-base font-semibold text-textPrimary">No financial results found</p>
                            <p className="text-xs text-textMuted mt-1">
                              {showWatchlistOnly
                                ? "None of your watchlist stocks have declared results matching your active filters."
                                : "No declared results matching the current filters or search query."}
                            </p>
                            {(searchQuery || showWatchlistOnly || declaredAuditFilter !== 'all' || declaredNatureFilter !== 'all' || declaredIndustryFilter !== 'all') && (
                              <button
                                onClick={() => {
                                  setSearchQuery('')
                                  setShowWatchlistOnly(false)
                                  setDeclaredAuditFilter('all')
                                  setDeclaredNatureFilter('all')
                                  setDeclaredIndustryFilter('all')
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
                      filteredDeclaredResults.map((item, idx) => {
                        const isWatchlisted = watchlistCodes.has(String(item.scripCode).trim()) ||
                                              watchlistCodes.has(String(item.shortName).trim().toUpperCase())
                        const isAudited = (item.audited || '').toLowerCase() === 'audited'
                        const isConsol = (item.natureOfReport || '').toLowerCase() === 'consolidated'
                        const bseLink = item.url || `https://www.bseindia.com/stock-share-price/-/${encodeURIComponent(item.shortName || 'stock')}/${item.scripCode}/`

                        return (
                          <tr
                            key={`${item.scripCode}-${item.quarterCode}-${idx}`}
                            className="hover:bg-white/[0.04] transition-colors group"
                          >
                            <td className="px-4 py-3.5 font-mono text-xs font-semibold text-textMuted group-hover:text-primary transition-colors">
                              <span className="px-2 py-0.5 rounded bg-black/20 dark:bg-white/5 border border-white/5">
                                {item.scripCode}
                              </span>
                            </td>

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

                            <td className="px-4 py-3.5">
                              <span className="text-xs text-textMuted">
                                {item.industryName || '—'}
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-textPrimary font-mono text-xs px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                                  {formatQuarterCode(item.quarterCode)}
                                </span>
                                <span className="text-[11px] text-textMuted font-mono">
                                  ({item.quarterCode})
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3.5 text-center">
                              <div className="inline-flex items-center gap-1.5">
                                <span className={clsx(
                                  "px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                                  isAudited
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                                    : "bg-amber-500/15 text-amber-400 border-amber-500/25"
                                )}>
                                  {item.audited || 'Unaudited'}
                                </span>
                                <span className={clsx(
                                  "px-2 py-0.5 rounded-full text-[11px] font-medium border",
                                  isConsol
                                    ? "bg-purple-500/15 text-purple-400 border-purple-500/25"
                                    : "bg-white/5 text-textMuted border-white/10"
                                )}>
                                  {item.natureOfReport || 'Standalone'}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3.5 text-xs text-textMuted font-mono">
                              {item.dtTm || '—'}
                            </td>

                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Link
                                  to={`/company-data?code=${item.scripCode}`}
                                  className="p-1.5 rounded-lg text-textMuted hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="View Company Data & Financials"
                                >
                                  <BarChart2 className="w-4 h-4" />
                                </Link>
                                <a
                                  href={bseLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg text-textMuted hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Open BSE Page"
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
            )}

            {/* Table Footer */}
            <div className="px-4 py-3 border-t border-white/5 bg-black/10 flex flex-col sm:flex-row items-center justify-between text-xs text-textMuted gap-2">
              <span>
                Showing <strong className="text-textPrimary">
                  {activeTab === 'calendar' ? filteredCalendarResults.length : filteredDeclaredResults.length}
                </strong> of{' '}
                <strong className="text-textPrimary">
                  {activeTab === 'calendar' ? calendarResults.length : declaredResults.length}
                </strong> {activeTab === 'calendar' ? 'scheduled result meetings' : 'declared result filings'}
              </span>
              {lastUpdated && (
                <span className="text-[11px]">
                  Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          </>
        )}
      </div>

    </PageTransition>
  )
}
