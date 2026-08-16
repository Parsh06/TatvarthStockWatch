import { useState, useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight, Download, Filter } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { apiClient } from '../../services/apiClient'
import { auth } from '../../services/firebase'
import PageTransition from '../Common/PageTransition'
import { Spinner } from '../Common/Loader'
import { normalizeBseData, normalizeNseData } from '../../utils/normalizeGainersLosers'

const TABLE_COLUMNS = {
  BSE: [
    'Security Code',
    'Security Name',
    'Group',
    'LTP',
    'Chg',
    '% Chg',
  ],
  NSE: [
    'Symbol',
    'Open',
    'High',
    'Low',
    'Prev. Close',
    'LTP',
    '%chng',
    'Volume (Shares)',
    'Value',
    'CA',
  ],
}

const NSE_CATEGORIES = [
  { key: 'allSec', label: 'All Securities' },
  { key: 'NIFTY', label: 'NIFTY 50' },
  { key: 'BANKNIFTY', label: 'BANK NIFTY' },
  { key: 'NIFTYNEXT50', label: 'NIFTY NEXT 50' },
  { key: 'SecGtr20', label: 'Securities > Rs 20' },
  { key: 'SecLwr20', label: 'Securities < Rs 20' },
  { key: 'FOSec', label: 'F&O Securities' },
]

export default function GainersLosersPage() {
  // Core single source of truth state
  const [exchange, setExchange] = useState('BSE') // 'BSE' or 'NSE'
  const [type, setType] = useState('gainer') // 'gainer' or 'loser'
  const [nseCategory, setNseCategory] = useState('allSec')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // Ref to track active AbortController for race condition prevention
  const abortControllerRef = useRef(null)

  const fetchData = async () => {
    // Abort previous in-flight request if user rapidly toggled options
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)
    setData([]) // Immediately clear old dataset to avoid showing stale data under new headers

    try {
      if (exchange === 'BSE') {
        const bseUrl = `/api/bse/gainers-losers?GLtype=${type}&IndxGrp=AllMkt&IndxGrpval=AllMkt&orderby=all`
        const res = await apiClient(bseUrl, { signal: controller.signal })
        
        if (controller.signal.aborted) return

        const rawList = res?.Table || []
        const normalized = rawList
          .map(normalizeBseData)
          .filter(Boolean)

        // Sorting: Gainers descending, Losers ascending by percentChange
        if (type === 'gainer') {
          normalized.sort((a, b) => b.percentChange - a.percentChange)
        } else {
          normalized.sort((a, b) => a.percentChange - b.percentChange)
        }

        setData(normalized)
      } else {
        // NSE request passing both index=gainers/loosers and category params for remote/local compatibility
        const nseIndexParam = type === 'gainer' ? 'gainers' : 'loosers'
        const nseUrl = `/api/nse/gainers-losers?index=${nseIndexParam}&type=${type}&category=${nseCategory}`
        const res = await apiClient(nseUrl, { signal: controller.signal })

        if (controller.signal.aborted) return

        let normalized = []
        if (Array.isArray(res?.data)) {
          normalized = res.data
        } else {
          let rawList = []
          if (res?.[nseCategory]?.data) {
            rawList = res[nseCategory].data
          } else if (res?.allSec?.data) {
            rawList = res.allSec.data
          } else if (res?.NIFTY?.data) {
            rawList = res.NIFTY.data
          }
          normalized = rawList.map(normalizeNseData).filter(Boolean)
        }

        // Sorting: Gainers descending, Losers ascending by percentChange
        if (type === 'gainer') {
          normalized.sort((a, b) => b.percentChange - a.percentChange)
        } else {
          normalized.sort((a, b) => a.percentChange - b.percentChange)
        }

        setData(normalized)
      }

      setLastRefreshed(new Date())
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('[GainersLosers Fetch Error]', err)
      setError('Failed to fetch data. Please try again.')
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  // Refetch when exchange, type, or nseCategory changes
  useEffect(() => {
    fetchData()
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, type, nseCategory])

  // Polling every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData()
    }, 60000)
    return () => clearInterval(interval)
  }, [exchange, type, nseCategory])

  const handleDownloadCsv = async () => {
    setDownloading(true)
    const filename = exchange === 'NSE' 
      ? `Tatvarth_NSE_TOP${type === 'gainer' ? 'gainers' : 'loosers'}_${nseCategory}.csv`
      : `Tatvarth_BSE_TOP${type === 'gainer' ? 'gainers' : 'loosers'}.csv`

    try {
      if (!data || data.length === 0) {
        toast.error(`No ${exchange} data available to download.`)
        return
      }

      const headers = TABLE_COLUMNS[exchange]
      let rows = []

      if (exchange === 'BSE') {
        rows = data.map(item => [
          `"${(item.securityCode || '').replace(/"/g, '""')}"`,
          `"${(item.securityName || '').replace(/"/g, '""')}"`,
          `"${(item.group || 'A').replace(/"/g, '""')}"`,
          item.ltp || 0,
          item.change || 0,
          item.percentChange || 0,
        ].join(','))
      } else {
        rows = data.map(item => [
          `"${(item.symbol || '').replace(/"/g, '""')}"`,
          item.open || 0,
          item.high || 0,
          item.low || 0,
          item.previousClose || 0,
          item.ltp || 0,
          item.percentChange || 0,
          item.volume || 0,
          item.value || 0,
          `"${(item.ca || '-').replace(/"/g, '""')}"`,
        ].join(','))
      }

      const csvContent = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(downloadUrl)
      toast.success(`Downloaded ${filename} successfully!`)
    } catch (err) {
      console.error('[CSV Download Error]', err)
      toast.error('Failed to download CSV. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const activeCategoryLabel = exchange === 'NSE' 
    ? (NSE_CATEGORIES.find(c => c.key === nseCategory)?.label || 'All Securities') 
    : 'All Securities'

  const columns = TABLE_COLUMNS[exchange]

  return (
    <PageTransition className="space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {type === 'gainer' ? <TrendingUp className="w-6 h-6 text-green-500" /> : <TrendingDown className="w-6 h-6 text-red-500" />}
            Top {type === 'gainer' ? 'Gainers' : 'Losers'}
          </h1>
          <p className="text-textMuted mt-1 text-sm">
            Real-time market movers updating every minute. Last updated: {lastRefreshed.toLocaleTimeString()}
          </p>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          {/* Refresh Button */}
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surfaceHover border border-border rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Type Toggle & Exchange Filters & Category Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass-panel rounded-2xl p-4">
        
        {/* Gainers / Losers Switch */}
        <div className="flex items-center bg-black/20 border border-white/5 rounded-xl p-1 shadow-inner">
          <button
            onClick={() => setType('gainer')}
            className={clsx(
              "flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all",
              type === 'gainer' ? "bg-emerald-500/20 text-emerald-400 shadow-sm" : "text-textMuted hover:text-textPrimary"
            )}
          >
            <ArrowUpRight className="w-4 h-4" /> Gainers
          </button>
          <button
            onClick={() => setType('loser')}
            className={clsx(
              "flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all",
              type === 'loser' ? "bg-danger/20 text-danger shadow-sm" : "text-textMuted hover:text-textPrimary"
            )}
          >
            <ArrowDownRight className="w-4 h-4" /> Losers
          </button>
        </div>

        {/* Exchange Switch & Category Dropdown */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          
          {/* NSE Index Category Selector */}
          {exchange === 'NSE' && (
            <div className="flex items-center gap-2 bg-black/20 border border-white/5 rounded-xl px-3 py-1.5 shadow-inner">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <select
                value={nseCategory}
                onChange={(e) => setNseCategory(e.target.value)}
                className="bg-transparent text-textPrimary text-xs font-semibold outline-none cursor-pointer pr-1"
              >
                {NSE_CATEGORIES.map(cat => (
                  <option key={cat.key} value={cat.key} className="bg-surface text-textPrimary">
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* BSE / NSE Switch */}
          <div className="flex items-center bg-black/20 border border-white/5 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setExchange('BSE')}
              className={clsx(
                "flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all",
                exchange === 'BSE' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
              )}
            >
              BSE
            </button>
            <button
              onClick={() => setExchange('NSE')}
              className={clsx(
                "flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all",
                exchange === 'NSE' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
              )}
            >
              NSE
            </button>
          </div>

        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3 mt-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Content Area - Dynamic Table Card */}
      <div className="relative mt-6">
        {loading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-30 flex items-center justify-center rounded-xl">
            <Spinner size="lg" />
          </div>
        )}

        <div key={`table-${exchange}-${type}-${nseCategory}`} className="glass-panel rounded-2xl overflow-hidden flex flex-col h-[500px]">
          
          {/* Card Header with Dynamic Title & Single Download Button */}
          <div className="bg-white/5 border-b border-white/5 px-6 py-4 font-semibold flex items-center justify-between sticky top-0 z-20">
            <span className="text-textPrimary tracking-tight font-semibold">
              {exchange} {type === 'gainer' ? 'Gainers' : 'Losers'} {exchange === 'NSE' ? `(${activeCategoryLabel})` : ''}
            </span>
            <button
              onClick={handleDownloadCsv}
              disabled={downloading || data.length === 0}
              title={`Download ${exchange} Top ${type === 'gainer' ? 'Gainers' : 'Losers'} CSV`}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 shadow-sm"
            >
              <Download className={clsx("w-3.5 h-3.5", downloading && "animate-bounce")} />
              <span>{downloading ? 'Downloading...' : 'Download CSV'}</span>
            </button>
          </div>

          {/* Dynamic Table Body matching Canonical Column Headers */}
          <div className="overflow-y-auto overflow-x-auto flex-1 relative scrollbar-hide">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-black/20 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  {columns.map((colHeader, idx) => (
                    <th 
                      key={colHeader} 
                      className={clsx(
                        "px-4 py-3 font-medium",
                        idx >= 2 && idx < columns.length - 1 ? "text-right" : ""
                      )}
                    >
                      {colHeader}
                    </th>
                  ))}
                  <th className="w-full"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {exchange === 'BSE' ? (
                  data.map((item, idx) => (
                    <tr key={`${item.securityCode}-${idx}`} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 font-medium">{item.securityCode}</td>
                      <td className="px-4 py-3 font-medium">
                        {item.rawUrl ? (
                          <a href={item.rawUrl} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors" title={item.securityName}>
                            {item.securityName.length > 35 ? item.securityName.substring(0, 35) + '...' : item.securityName}
                          </a>
                        ) : (
                          item.securityName
                        )}
                      </td>
                      <td className="px-4 py-3 text-textMuted">{item.group}</td>
                      <td className="px-4 py-3 text-right font-medium">{item.ltp?.toFixed(2)}</td>
                      <td className={clsx("px-4 py-3 text-right font-medium", item.change >= 0 ? "text-green-500" : "text-red-500")}>
                        {item.change > 0 ? '+' : ''}{item.change?.toFixed(2)}
                      </td>
                      <td className={clsx("px-4 py-3 text-right font-medium", item.percentChange >= 0 ? "text-green-500" : "text-red-500")}>
                        {item.percentChange > 0 ? '+' : ''}{item.percentChange?.toFixed(2)}%
                      </td>
                      <td className="w-full"></td>
                    </tr>
                  ))
                ) : (
                  data.map((item, idx) => (
                    <tr key={`${item.symbol}-${idx}`} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 font-medium text-textPrimary">{item.symbol}</td>
                      <td className="px-4 py-3 text-textMuted">{item.open?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-textMuted text-right">{item.high?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-textMuted text-right">{item.low?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-textMuted text-right">{item.previousClose?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-medium text-textPrimary">{item.ltp?.toFixed(2)}</td>
                      <td className={clsx("px-4 py-3 text-right font-medium", item.percentChange >= 0 ? "text-green-500" : "text-red-500")}>
                        {item.percentChange > 0 ? '+' : ''}{item.percentChange?.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right text-textMuted">
                        {item.volume?.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right text-textMuted">
                        {item.value?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-xs text-textMuted max-w-[150px] truncate" title={item.ca}>
                        {item.ca}
                      </td>
                      <td className="w-full"></td>
                    </tr>
                  ))
                )}
                {data.length === 0 && !loading && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-textMuted">
                      No {type === 'gainer' ? 'gainers' : 'losers'} found for {exchange} {exchange === 'NSE' ? `(${activeCategoryLabel})` : ''}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </PageTransition>
  )
}
