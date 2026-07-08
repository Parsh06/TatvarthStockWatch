import { useState, useMemo } from 'react'
import { ArrowUpDown, ExternalLink } from 'lucide-react'
import clsx from 'clsx'

// ── Smart Indicator Logic ────────────────────────────────────────────────────
function getSmartSignals(stock) {
  const signals = []
  const pct = stock.changePct || 0
  const vm  = stock.volMultiple || 0

  if (vm >= 5 && pct > 0)   signals.push({ label: '🔥 High Conviction', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' })
  if (vm >= 3 && pct >= 2)  signals.push({ label: '🚀 Breakout Signal',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' })
  if (vm >= 3 && pct < -1)  signals.push({ label: '⚠ Distribution',      color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' })
  if (vm >= 10)             signals.push({ label: '💎 Extreme Volume',    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' })

  return signals
}

// ── Volume bar ───────────────────────────────────────────────────────────────
function VolumeBar({ multiple, max }) {
  const pct = Math.min(100, (multiple / Math.max(max, 1)) * 100)
  const color = multiple >= 10 ? 'bg-orange-500' : multiple >= 5 ? 'bg-amber-500' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-textMuted w-10 text-right shrink-0">{multiple.toFixed(1)}x</span>
    </div>
  )
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtVol(v) {
  if (!v) return '-'
  if (v >= 10000000) return (v / 10000000).toFixed(2) + ' Cr'
  if (v >= 100000)   return (v / 100000).toFixed(2)   + ' L'
  if (v >= 1000)     return (v / 1000).toFixed(1)     + 'k'
  return String(v)
}
function fmtTurnover(v) {
  if (!v) return '-'
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(2) + ' Cr'
  if (v >= 100000)   return '₹' + (v / 100000).toFixed(2) + ' L'
  return '₹' + v.toFixed(0)
}

// ── SortIcon helper ───────────────────────────────────────────────────────────
function SortIcon({ column, sortConfig }) {
  return (
    <ArrowUpDown className={clsx(
      'w-3 h-3 inline ml-1',
      sortConfig.key === column ? 'text-primary opacity-100' : 'opacity-30'
    )} />
  )
}

// ── Main Table ────────────────────────────────────────────────────────────────
export default function VolumeSpurtTable({ stocks, search, onAiClick }) {
  const [sortConfig, setSortConfig] = useState({ key: 'volMultiple', direction: 'desc' })

  const requestSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const maxMultiple = useMemo(() => Math.max(...stocks.map(s => s.volMultiple || 0), 1), [stocks])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return stocks
    return stocks.filter(s =>
      s.company?.toLowerCase().includes(q) ||
      s.symbol?.toLowerCase().includes(q) ||
      s.bseCode?.includes(q)
    )
  }, [stocks, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = a[sortConfig.key] ?? 0
      let bv = b[sortConfig.key] ?? 0
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortConfig])

  const th = (label, key, extra = '') => (
    <th
      className={`px-3 py-3 font-medium cursor-pointer hover:text-white whitespace-nowrap ${extra}`}
      onClick={() => requestSort(key)}
    >
      {label} <SortIcon column={key} sortConfig={sortConfig} />
    </th>
  )

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-hide">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-black/20 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
          <tr>
            {th('#', 'rank')}
            {th('Symbol / Company', 'symbol')}
            {th('Price (₹)', 'ltp', 'text-right')}
            {th('Change', 'changePct', 'text-right')}
            {th('Vol Multiple', 'volMultiple')}
            {th('Volume', 'currentVolume', 'hidden xl:table-cell text-right')}
            {th('Turnover', 'turnoverCr', 'hidden xl:table-cell text-right')}
            <th className="px-3 py-3 font-medium">Signals</th>
            <th className="px-3 py-3 font-medium text-center">AI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((stock) => {
            const signals = getSmartSignals(stock)
            const isUp = stock.changePct >= 0
            return (
              <tr key={stock.rank + stock.symbol} className="hover:bg-white/5 transition-colors group">
                {/* Rank */}
                <td className="px-3 py-3 text-textMuted text-xs">{stock.rank}</td>

                {/* Symbol + Company */}
                <td className="px-3 py-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-textPrimary">{stock.symbol || stock.bseCode}</span>
                      {stock.bseUrl && (
                        <a href={stock.bseUrl} target="_blank" rel="noreferrer" className="text-textMuted hover:text-primary">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-textMuted max-w-[160px] truncate" title={stock.company}>
                      {stock.company}
                    </span>
                  </div>
                </td>

                {/* LTP */}
                <td className="px-3 py-3 text-right font-semibold">
                  {stock.ltp ? `₹${stock.ltp.toFixed(2)}` : '-'}
                </td>

                {/* Change */}
                <td className={clsx('px-3 py-3 text-right font-medium', isUp ? 'text-green-500' : 'text-red-500')}>
                  <div>{isUp ? '+' : ''}{(stock.change ?? 0).toFixed(2)}</div>
                  <div className="text-xs">{isUp ? '+' : ''}{(stock.changePct ?? 0).toFixed(2)}%</div>
                </td>

                {/* Volume Multiple Bar */}
                <td className="px-3 py-3 min-w-[120px]">
                  <VolumeBar multiple={stock.volMultiple || 0} max={maxMultiple} />
                </td>

                {/* Volume */}
                <td className="px-3 py-3 text-right text-textMuted hidden xl:table-cell">
                  <div>{fmtVol(stock.currentVolume)}</div>
                  <div className="text-xs opacity-60">avg: {fmtVol(stock.avgVolume)}</div>
                </td>

                {/* Turnover */}
                <td className="px-3 py-3 text-right text-textMuted hidden xl:table-cell">
                  {fmtTurnover(stock.turnoverCr)}
                </td>

                {/* Signals */}
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {signals.map((s, i) => (
                      <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${s.color}`}>
                        {s.label}
                      </span>
                    ))}
                  </div>
                </td>

                {/* AI */}
                <td className="px-3 py-3 text-center">
                  <button
                    onClick={() => onAiClick(stock)}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-textMuted hover:text-primary transition-colors"
                    title="AI Insight"
                  >
                    ✨
                  </button>
                </td>
              </tr>
            )
          })}

          {sorted.length === 0 && (
            <tr>
              <td colSpan="9" className="px-4 py-12 text-center text-textMuted">
                {search ? 'No matching stocks found.' : 'No records found.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
