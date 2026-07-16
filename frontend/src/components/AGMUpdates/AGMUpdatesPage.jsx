import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, Download, Calendar, Users, Briefcase } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { exportToXLSX } from '../../utils/csvParser'
import PageTransition from '../Common/PageTransition'
import { useWatchlist } from '../../contexts/WatchlistContext'

const getISTDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const today = () => getISTDate();
const nextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return getISTDate(d);
};

function StatCard({ label, value, sub, color = 'text-textPrimary', icon: Icon, iconColor }) {
  return (
    <div className="glass-panel hover:-translate-y-1 hover:shadow-premium-hover transition-all duration-300 rounded-2xl p-5 flex items-center gap-4 group relative overflow-hidden">
      {/* Background soft glow hack */}
      <div className={clsx("absolute -top-10 -right-10 w-24 h-24 blur-3xl opacity-20 rounded-full transition-opacity group-hover:opacity-30", iconColor || 'bg-primary')} />
      
      {Icon && (
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner z-10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3', iconColor || 'bg-black/5 dark:bg-white/5')}>
          <Icon className="w-5 h-5 text-primary" />
        </div>
      )}
      <div className="z-10">
        <p className="text-[11px] font-medium tracking-tight text-textMuted mb-0.5 uppercase">{label}</p>
        <p className={clsx('text-2xl font-bold font-display tabular-nums tracking-tight', color)}>{value}</p>
        {sub && <p className="text-xs text-textMuted mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function AGMUpdatesPage() {
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(nextMonth())
  const [searchQuery, setSearchQuery] = useState('')
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false)
  
  const { scripts: watchlistScripts } = useWatchlist()
  
  const [agms, setAgms] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch AGM Updates
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Format dates from YYYY-MM-DD to YYYYMMDD
      const formatApiDate = (d) => {
        const [y, m, day] = d.split('-')
        return `${y}${m}${day}`
      }

      // 2. Fetch Board Meetings / AGM
      const url = `/api/bse/agm-updates?fromDT=${formatApiDate(fromDate)}&ToDt=${formatApiDate(toDate)}`
      const data = await apiClient(url)
      const fetchedAgms = (data?.Table || [])
        .filter(m => m.scrip_code && m.scrip_code !== '-')
      setAgms(fetchedAgms)
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Fetch on mount and when dates change
  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate])

  const watchlistCodes = useMemo(() => {
    const codes = new Set()
    for (const s of (watchlistScripts || [])) {
      if (s.bseCode) codes.add(s.bseCode)
    }
    return codes
  }, [watchlistScripts])

  // Filter AGMs locally
  const filteredAgms = useMemo(() => {
    let result = agms

    if (showWatchlistOnly) {
      result = result.filter(m => watchlistCodes.has(String(m.scrip_code)))
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(m => 
        (m.Long_Name || '').toLowerCase().includes(q) ||
        (m.scrip_code || '').toLowerCase().includes(q) ||
        (m.PURPOSE_NAME || '').toLowerCase().includes(q) ||
        (m.Industry_name || '').toLowerCase().includes(q)
      )
    }
    // Sort alphabetically by Company Name
    return [...result].sort((a, b) => {
      const nameA = (a.Long_Name || '').toLowerCase()
      const nameB = (b.Long_Name || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [agms, searchQuery, showWatchlistOnly, watchlistCodes])

  // Export to Excel
  const handleExport = () => {
    if (!filteredAgms.length) return
    const exportData = filteredAgms.map(m => ({
      'BSE Code': m.scrip_code,
      'Company Name': m.Long_Name,
      'Purpose': m.PURPOSE_NAME,
      'Meeting Date': m.MEETING_DATE,
      'Industry': m.Industry_name,
      'Announced On': m.DT_TM
    }))
    exportToXLSX(exportData, `AGM_Updates_${fromDate}_to_${toDate}`)
  }

  return (
    <PageTransition className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AGM Updates</h1>
          <p className="text-textMuted mt-1">
            Track scheduled Annual General Meetings and other board updates.
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
          <button 
            onClick={handleExport}
            disabled={!filteredAgms.length}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary rounded-xl text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-5 grid grid-cols-1 md:grid-cols-4 gap-5 items-end">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">From Date</label>
          <input 
            type="date" 
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-inner cursor-pointer"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">To Date</label>
          <input 
            type="date" 
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-inner cursor-pointer"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Search</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
            <input 
              type="text" 
              placeholder="Company, code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-inner placeholder:text-textMuted/50"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <button
            onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
            className={clsx(
              "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm border",
              showWatchlistOnly 
                ? "bg-primary/20 border-primary text-primary" 
                : "bg-white/5 border-white/10 text-textMuted hover:text-textPrimary hover:bg-white/10"
            )}
          >
            <Briefcase className="w-4 h-4" />
            {showWatchlistOnly ? "My Watchlist" : "All AGMs"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total AGMs" value={agms.length} icon={Calendar} />
        <StatCard label="Filtered AGMs" value={filteredAgms.length} icon={Users} />
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3">
          <p>{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto flex-1 scrollbar-hide">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/20 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-4 py-3 font-medium">BSE Code</th>
                <th className="px-4 py-3 font-medium">Company Name</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Meeting Date</th>
                <th className="px-4 py-3 font-medium">Announced On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-4 py-16 text-center text-textMuted">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 opacity-50 text-primary" />
                    <p>Loading AGM updates...</p>
                  </td>
                </tr>
              ) : filteredAgms.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-16 text-center text-textMuted">
                    No AGM updates found for this date range.
                  </td>
                </tr>
              ) : (
                filteredAgms.map((m, idx) => {
                  return (
                    <tr key={`${m.scrip_code}-${idx}`} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 font-medium">{m.scrip_code}</td>
                      <td className="px-4 py-3">
                        <a 
                          href={m.URL || `https://www.bseindia.com/stock-share-price/${m.Short_name || 'unknown'}/${m.Short_name || 'unknown'}/${m.scrip_code}/`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="hover:text-primary transition-colors flex items-center gap-1.5"
                        >
                          {m.Long_Name}
                        </a>
                        {m.Industry_name && (
                          <div className="text-xs text-textMuted mt-0.5">{m.Industry_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-textMuted whitespace-normal min-w-[200px]">
                        {m.PURPOSE_NAME}
                      </td>
                      <td className="px-4 py-3 font-medium text-textPrimary">{m.MEETING_DATE}</td>
                      <td className="px-4 py-3 text-textMuted">{m.DT_TM}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </PageTransition>
  )
}
