import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import PageTransition from '../Common/PageTransition'



export default function GainersLosersPage() {
  const [type, setType] = useState('gainer') // 'gainer' or 'loser'
  const [exchange, setExchange] = useState('BSE')
  
  // BSE specific state
  const [bseData, setBseData] = useState([])
  
  // NSE specific state
  const [nseData, setNseData] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const bseUrl = `/api/bse/gainers-losers?GLtype=${type}&IndxGrp=AllMkt&IndxGrpval=AllMkt&orderby=all`
      
      const nseType = type === 'gainer' ? 'gainers' : 'loosers'
      const nseUrl = `/api/nse/gainers-losers?index=${nseType}`
      
      const [bseRes, nseRes] = await Promise.allSettled([
        apiClient(bseUrl),
        apiClient(nseUrl)
      ])
      
      if (bseRes.status === 'fulfilled') {
        let items = bseRes.value?.Table || []
        items.sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
        setBseData(items)
      } else {
        console.error('[BSE fetch error]', bseRes.reason)
      }
      
      if (nseRes.status === 'fulfilled') {
        const res = nseRes.value
        let items = []
        if (res?.allSec?.data) items = res.allSec.data
        else if (res?.NIFTY?.data) items = res.NIFTY.data
        
        items.sort((a, b) => Math.abs(b.perChange || 0) - Math.abs(a.perChange || 0))
        setNseData(items)
      } else {
        console.error('[NSE fetch error]', nseRes.reason)
      }

      setLastRefreshed(new Date())
    } catch (err) {
      console.error(err)
      setError('Failed to fetch data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Refetch when filters change
  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  // Polling every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData()
    }, 60000)
    return () => clearInterval(interval)
  }, [type]) // Re-bind on state change

  const renderBseTable = () => (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-[500px]">
      <div className="bg-white/5 border-b border-white/5 px-6 py-4 font-semibold flex items-center justify-between sticky top-0 z-20">
        <span className="text-textPrimary tracking-tight">BSE {type === 'gainer' ? 'Gainers' : 'Losers'}</span>
      </div>
      <div className="overflow-y-auto overflow-x-auto flex-1 relative scrollbar-hide">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-black/20 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-4 py-3 font-medium">BSE Code</th>
              <th className="px-4 py-3 font-medium">Company Name</th>
              <th className="px-4 py-3 font-medium text-right">LTP (₹)</th>
              <th className="px-4 py-3 font-medium text-right">Change</th>
              <th className="px-4 py-3 font-medium text-right">% Change</th>
              <th className="px-4 py-3 font-medium text-right">Volume</th>
              <th className="w-full"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {bseData.map((item, idx) => (
              <tr key={`${item.scrip_cd}-${idx}`} className="hover:bg-white/5 transition-colors group">
                <td className="px-4 py-3 font-medium">{item.scrip_cd}</td>
                <td className="px-4 py-3">
                  <a href={item.URL} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors" title={item.LONG_NAME || item.scripname}>
                    {(item.LONG_NAME || item.scripname)?.length > 30 
                      ? (item.LONG_NAME || item.scripname).substring(0, 30) + '...' 
                      : (item.LONG_NAME || item.scripname)}
                  </a>
                </td>
                <td className="px-4 py-3 text-right font-medium">{item.ltradert?.toFixed(2)}</td>
                <td className={clsx("px-4 py-3 text-right font-medium", item.change_val >= 0 ? "text-green-500" : "text-red-500")}>
                  {item.change_val > 0 ? '+' : ''}{item.change_val?.toFixed(2)}
                </td>
                <td className={clsx("px-4 py-3 text-right font-medium", item.change_percent >= 0 ? "text-green-500" : "text-red-500")}>
                  {item.change_percent > 0 ? '+' : ''}{item.change_percent?.toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right text-textMuted">
                  {item.trd_vol?.toLocaleString('en-IN')}
                </td>
                <td className="w-full"></td>
              </tr>
            ))}
            {bseData.length === 0 && !loading && (
              <tr>
                <td colSpan="7" className="px-4 py-12 text-center text-textMuted">No records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderNseTable = () => (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-[500px]">
      <div className="bg-white/5 border-b border-white/5 px-6 py-4 font-semibold flex items-center justify-between sticky top-0 z-20">
        <span className="text-textPrimary tracking-tight">NSE {type === 'gainer' ? 'Gainers' : 'Losers'} (All Securities)</span>
      </div>
      <div className="overflow-y-auto overflow-x-auto flex-1 relative scrollbar-hide">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-black/20 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Series</th>
              <th className="px-4 py-3 font-medium text-right">LTP (₹)</th>
              <th className="px-4 py-3 font-medium text-right">Change</th>
              <th className="px-4 py-3 font-medium text-right">% Change</th>
              <th className="px-4 py-3 font-medium text-right">Volume</th>
              <th className="w-full"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {nseData.map((item, idx) => (
              <tr key={`${item.symbol}-${idx}`} className="hover:bg-white/5 transition-colors group">
                <td className="px-4 py-3 font-medium">{item.symbol}</td>
                <td className="px-4 py-3 text-textMuted">{item.series}</td>
                <td className="px-4 py-3 text-right font-medium">{item.ltp?.toFixed(2)}</td>
                <td className={clsx("px-4 py-3 text-right font-medium", item.net_price >= 0 ? "text-green-500" : "text-red-500")}>
                  {item.net_price > 0 ? '+' : ''}{item.net_price?.toFixed(2)}
                </td>
                <td className={clsx("px-4 py-3 text-right font-medium", item.perChange >= 0 ? "text-green-500" : "text-red-500")}>
                  {item.perChange > 0 ? '+' : ''}{item.perChange?.toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right text-textMuted">
                  {item.trade_quantity?.toLocaleString('en-IN')}
                </td>
                <td className="w-full"></td>
              </tr>
            ))}
            {nseData.length === 0 && !loading && (
              <tr>
                <td colSpan="7" className="px-4 py-12 text-center text-textMuted">No records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

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

      {/* Type Toggle & Exchange Filters */}
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

        {/* Exchange Switch */}
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3 mt-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Content Area - Full Width Table */}
      <div className="relative mt-6">
        {loading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-30 flex items-center justify-center rounded-xl">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
        
        <div className="w-full">
          {exchange === 'BSE' ? renderBseTable() : renderNseTable()}
        </div>
      </div>
    </PageTransition>
  )
}
