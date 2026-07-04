import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'

// Constants for BSE filters
const BSE_INDEX_GROUPS = [
  { label: 'All Market', value: 'AllMkt' },
  { label: 'Group', value: 'Group' },
  { label: 'Index', value: 'Index' },
  { label: 'Equity (T+1)', value: 'EqT1' },
  { label: 'Equity (T+0)', value: 'EqT0' },
]

const BSE_ORDER_BY = [
  { label: 'All', value: 'all' },
  { label: '> 10%', value: 'morethen10' },
  { label: '5% to 10%', value: '5to10' },
  { label: '2% to 5%', value: '2to5' },
  { label: 'Up to 2%', value: 'upto2' },
]

export default function GainersLosersPage() {
  const [activeTab, setActiveTab] = useState('BSE')
  const [type, setType] = useState('gainer') // 'gainer' or 'loser' (for BSE) or 'loosers' for NSE
  
  // BSE specific state
  const [bseIndxGrp, setBseIndxGrp] = useState('AllMkt')
  const [bseOrderBy, setBseOrderBy] = useState('all')
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
      if (activeTab === 'BSE') {
        const url = `/api/bse/gainers-losers?GLtype=${type}&IndxGrp=${bseIndxGrp}&IndxGrpval=${bseIndxGrp}&orderby=${bseOrderBy}`
        const res = await apiClient(url)
        let items = res?.Table || []
        // Ensure descending order by absolute change percentage
        items.sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
        setBseData(items)
      } else {
        const nseType = type === 'gainer' ? 'gainers' : 'loosers'
        const url = `/api/nse/gainers-losers?index=${nseType}`
        const res = await apiClient(url)
        // Extract allSec data
        const allSec = res?.NIFTY?.data || res?.allSec?.data || [] 
        
        // Let's parse exactly how NSE structures it. Often it's res.NIFTY.data or res.allSec.data. 
        // We'll look for allSec or default to first key
        let items = []
        if (res?.allSec?.data) items = res.allSec.data
        else if (res?.NIFTY?.data) items = res.NIFTY.data // Fallback just in case
        
        // Ensure descending order by absolute change percentage
        items.sort((a, b) => Math.abs(b.perChange || 0) - Math.abs(a.perChange || 0))
        setNseData(items)
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
  }, [activeTab, type, bseIndxGrp, bseOrderBy])

  // Polling every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData()
    }, 60000)
    return () => clearInterval(interval)
  }, [activeTab, type, bseIndxGrp, bseOrderBy]) // Re-bind on state change

  const renderBseTable = () => (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col mt-4 min-h-[400px]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-background border-b border-border text-xs uppercase tracking-wider text-textMuted sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 font-medium">BSE Code</th>
              <th className="px-4 py-3 font-medium">Company Name</th>
              <th className="px-4 py-3 font-medium text-right">LTP (₹)</th>
              <th className="px-4 py-3 font-medium text-right">Change</th>
              <th className="px-4 py-3 font-medium text-right">% Change</th>
              <th className="px-4 py-3 font-medium text-right">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bseData.map((item, idx) => (
              <tr key={`${item.scrip_cd}-${idx}`} className="hover:bg-surfaceHover transition-colors">
                <td className="px-4 py-3 font-medium">{item.scrip_cd}</td>
                <td className="px-4 py-3">
                  <a href={item.URL} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                    {item.LONG_NAME || item.scripname}
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
              </tr>
            ))}
            {bseData.length === 0 && !loading && (
              <tr>
                <td colSpan="6" className="px-4 py-12 text-center text-textMuted">No records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderNseTable = () => (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col mt-4 min-h-[400px]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-background border-b border-border text-xs uppercase tracking-wider text-textMuted sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Series</th>
              <th className="px-4 py-3 font-medium text-right">LTP (₹)</th>
              <th className="px-4 py-3 font-medium text-right">Change</th>
              <th className="px-4 py-3 font-medium text-right">% Change</th>
              <th className="px-4 py-3 font-medium text-right">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {nseData.map((item, idx) => (
              <tr key={`${item.symbol}-${idx}`} className="hover:bg-surfaceHover transition-colors">
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
              </tr>
            ))}
            {nseData.length === 0 && !loading && (
              <tr>
                <td colSpan="6" className="px-4 py-12 text-center text-textMuted">No records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Tabs */}
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
          {/* Exchange Tabs */}
          <div className="flex items-center bg-surface border border-border rounded-lg p-1">
            <button
              onClick={() => setActiveTab('BSE')}
              className={clsx(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === 'BSE' ? "bg-primary/20 text-primary" : "text-textMuted hover:text-textPrimary"
              )}
            >
              BSE
            </button>
            <button
              onClick={() => setActiveTab('NSE')}
              className={clsx(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === 'NSE' ? "bg-primary/20 text-primary" : "text-textMuted hover:text-textPrimary"
              )}
            >
              NSE
            </button>
          </div>
          
          {/* Refresh Button */}
          <button 
            onClick={fetchData}
            disabled={loading}
            className="hidden md:flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surfaceHover border border-border rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Type Toggle & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        
        {/* Gainers / Losers Switch */}
        <div className="flex items-center bg-surface border border-border rounded-lg p-1">
          <button
            onClick={() => setType('gainer')}
            className={clsx(
              "flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-md transition-all",
              type === 'gainer' ? "bg-green-500/20 text-green-500" : "text-textMuted hover:text-textPrimary"
            )}
          >
            <ArrowUpRight className="w-4 h-4" /> Gainers
          </button>
          <button
            onClick={() => setType('loser')}
            className={clsx(
              "flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-md transition-all",
              type === 'loser' ? "bg-red-500/20 text-red-500" : "text-textMuted hover:text-textPrimary"
            )}
          >
            <ArrowDownRight className="w-4 h-4" /> Losers
          </button>
        </div>

        {/* BSE Filters */}
        {activeTab === 'BSE' && (
          <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <select
              value={bseIndxGrp}
              onChange={(e) => setBseIndxGrp(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:border-primary outline-none"
            >
              {BSE_INDEX_GROUPS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            
            <select
              value={bseOrderBy}
              onChange={(e) => setBseOrderBy(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:border-primary outline-none"
            >
              {BSE_ORDER_BY.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-20 flex items-center justify-center rounded-xl">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
        
        {activeTab === 'BSE' ? renderBseTable() : renderNseTable()}
      </div>
    </div>
  )
}
