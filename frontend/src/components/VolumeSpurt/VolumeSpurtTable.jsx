import { useState, useMemo } from 'react'
import { ArrowUpDown, ExternalLink } from 'lucide-react'
import clsx from 'clsx'

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
export default function VolumeSpurtTable({ stocks, search }) {
  const [sortConfig, setSortConfig] = useState({ key: 'volMultiple', direction: 'desc' })

  const requestSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

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
            {th('Securities Code', 'bseCode')}
            {th('Securities Name', 'symbol')}
            {th("Today's Vol(Lacs)", 'currentVolume', 'text-right')}
            {th('2 Wk Avg. Vol(Lacs)', 'avgVolume', 'text-right')}
            {th('Volume Change (Times)', 'volMultiple', 'text-right')}
            {th('Turnover', 'turnoverCr', 'text-right')}
            {th('LTP', 'ltp', 'text-right')}
            {th('Change', 'change', 'text-right')}
            {th('Change %', 'changePct', 'text-right')}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((stock) => {
            const isUp = stock.changePct >= 0
            return (
              <tr key={stock.bseCode + stock.symbol} className="hover:bg-white/5 transition-colors group">
                
                {/* Securities Code */}
                <td className="px-3 py-3 text-textMuted font-mono text-xs">
                  {stock.bseCode}
                </td>

                {/* Securities Name (Symbol) */}
                <td className="px-3 py-3 font-semibold text-textPrimary">
                  {stock.symbol}
                </td>

                {/* Today's Vol */}
                <td className="px-3 py-3 text-right">
                  {stock.currentVolume?.toFixed(2) || '0.00'}
                </td>

                {/* 2 Wk Avg Vol */}
                <td className="px-3 py-3 text-right">
                  {stock.avgVolume?.toFixed(2) || '0.00'}
                </td>

                {/* Volume Change (Times) */}
                <td className="px-3 py-3 text-right font-medium">
                  {stock.volMultiple?.toFixed(2) || '0.00'}
                </td>

                {/* Turnover */}
                <td className="px-3 py-3 text-right">
                  {stock.turnoverCr?.toFixed(2) || '0.00'}
                </td>

                {/* LTP */}
                <td className="px-3 py-3 text-right font-semibold">
                  {stock.ltp?.toFixed(2) || '0.00'}
                </td>

                {/* Change */}
                <td className={clsx('px-3 py-3 text-right font-medium', isUp ? 'text-green-500' : 'text-red-500')}>
                  {stock.change?.toFixed(2) || '0.00'}
                </td>

                {/* Change % */}
                <td className={clsx('px-3 py-3 text-right font-medium', isUp ? 'text-green-500' : 'text-red-500')}>
                  {stock.changePct?.toFixed(2) || '0.00'}
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
