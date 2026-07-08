import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, AlertCircle, Search, Activity, TrendingUp, TrendingDown, BarChart2, Zap } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import VolumeSpurtTable from './VolumeSpurtTable'

// ── Summary card data ─────────────────────────────────────────────────────────
function getSummaryCards(stocks) {
  if (!stocks.length) return []

  const gainers    = stocks.filter(s => s.changePct > 0)
  const losers     = stocks.filter(s => s.changePct < 0)
  const maxVm      = stocks.reduce((m, s) => s.volMultiple > m.volMultiple ? s : m, stocks[0])
  const maxTo      = stocks.reduce((m, s) => s.turnoverCr > m.turnoverCr ? s : m, stocks[0])
  const avgVm      = stocks.reduce((a, s) => a + (s.volMultiple || 0), 0) / stocks.length
  const avgChg     = stocks.reduce((a, s) => a + (s.changePct || 0), 0) / stocks.length

  return [
    { title: 'Total High Vol Stocks', value: stocks.length,              icon: <Activity className="w-5 h-5 text-textMuted" /> },
    { title: 'Highest Vol Multiple',  value: `${maxVm.volMultiple.toFixed(1)}x`, sub: maxVm.symbol, icon: <Zap className="w-5 h-5 text-orange-400" /> },
    { title: 'Highest Turnover',      value: fmtTurnover(maxTo.turnoverCr), sub: maxTo.symbol, icon: <BarChart2 className="w-5 h-5 text-textMuted" /> },
    { title: 'Positive Movers',       value: gainers.length, icon: <TrendingUp className="w-5 h-5 text-green-500" />, valueClass: 'text-green-500' },
    { title: 'Negative Movers',       value: losers.length,  icon: <TrendingDown className="w-5 h-5 text-red-500" />,  valueClass: 'text-red-500' },
    { title: 'Avg Vol Multiple',      value: `${avgVm.toFixed(1)}x`,     icon: <Activity className="w-5 h-5 text-textMuted" /> },
    { title: 'Avg Price Change',      value: `${avgChg > 0 ? '+' : ''}${avgChg.toFixed(2)}%`, icon: <Activity className="w-5 h-5 text-textMuted" />, valueClass: avgChg >= 0 ? 'text-green-500' : 'text-red-500' },
  ]
}

function fmtTurnover(v) {
  if (!v) return '-'
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(2) + ' Cr'
  if (v >= 100000)   return '₹' + (v / 100000).toFixed(2) + ' L'
  return '₹' + v.toFixed(0)
}


// ── Main Section ──────────────────────────────────────────────────────────────
export default function VolumeSpurtSection() {
  const [stocks, setStocks]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [search, setSearch]         = useState('')

  const fetchData = useCallback(async () => {
    try {
      const data = await apiClient('/api/market/volume-spurt')
      setStocks(data?.stocks || [])
      setLastUpdated(data?.lastUpdated ? new Date(data.lastUpdated) : new Date())
      setError(null)
    } catch (e) {
      setError(e?.message || 'Failed to fetch volume spurt data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  const summaryCards = useMemo(() => getSummaryCards(stocks), [stocks])

  return (
    <div className="space-y-4 mt-10">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-400" />
            Live High Volume — Volume Spurt
          </h2>
          <p className="text-textMuted mt-1 text-sm">
            Stocks with unusually high trading volumes (BSE).{' '}
            {lastUpdated && <>Last updated: <span className="text-textPrimary">{lastUpdated.toLocaleTimeString()}</span></>}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surfaceHover border border-border rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      {stocks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {summaryCards.map((card, i) => (
            <div key={i} className="glass-panel p-4 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-medium text-textMuted uppercase tracking-wider leading-tight">{card.title}</h3>
                {card.icon}
              </div>
              <div className={clsx('text-lg font-bold tracking-tight', card.valueClass || 'text-textPrimary')}>
                {card.value}
              </div>
              {card.sub && <div className="text-xs text-textMuted mt-0.5 truncate">{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search company, symbol or BSE code…"
          className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-textPrimary placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-border relative">
        {loading && stocks.length === 0 && (
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
        {stocks.length > 0 && (
          <div className={clsx("transition-opacity duration-300", loading ? "opacity-60 pointer-events-none" : "opacity-100")}>
            <VolumeSpurtTable stocks={stocks} search={search} />
          </div>
        )}
      </div>
    </div>
  )
}
