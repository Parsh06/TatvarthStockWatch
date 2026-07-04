import { useState, useMemo, useEffect } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, Download, AlertCircle, Search, X, ChevronUp, ChevronDown as ChevDown, Layers, ArrowUpDown } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { exportToXLSX } from '../../utils/csvParser'
import ScriptSearchInput from '../Common/ScriptSearchInput'

const today        = () => new Date().toISOString().slice(0, 10)
const toYYYYMMDD   = (d) => d.replace(/-/g, '')
const dateNDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

const QUICK_RANGES = [
  { label: 'Today',   from: today,                 to: today },
  { label: '3 Days',  from: () => dateNDaysAgo(2),  to: today },
  { label: '1 Week',  from: () => dateNDaysAgo(6),  to: today },
  { label: '1 Month', from: () => dateNDaysAgo(29), to: today },
]

const COLS = [
  { key: 'dealDate',   label: 'Date',        align: 'left',  sortable: true },
  { key: 'dealType',   label: 'Type',        align: 'left',  sortable: true },
  { key: 'bseCode',    label: 'Code / Symbol',    align: 'left',  sortable: false },
  { key: 'scripname',  label: 'Company',     align: 'left',  sortable: true },
  { key: 'clientName', label: 'Client',      align: 'left',  sortable: true },
  { key: 'transactionType', label: 'B/S',   align: 'left',  sortable: true },
  { key: 'quantity',   label: 'Qty',         align: 'right', sortable: true },
  { key: 'price',      label: 'Price (₹)',   align: 'right', sortable: true },
  { key: 'valueCr',    label: 'Value (Cr)',  align: 'right', sortable: true },
]

function StatCard({ label, value, sub, color = 'text-textPrimary', border }) {
  return (
    <div className={clsx('bg-surface border rounded-xl p-4', border || 'border-border')}>
      <p className="text-xs text-textMuted mb-1">{label}</p>
      <p className={clsx('text-xl font-bold tabular-nums', color)}>{value}</p>
      {sub && <p className="text-xs text-textMuted mt-0.5">{sub}</p>}
    </div>
  )
}

export default function BulkBlockPage() {
  const [exchange,   setExchange]   = useState('BSE')
  const [fromDate,   setFromDate]   = useState(today())
  const [toDate,     setToDate]     = useState(today())
  const [dealType,   setDealType]   = useState('both') // BSE: 'both', '1', '2' | NSE: 'bulk_deals', 'block_deals', 'short_deals'
  const [codeFilter, setCodeFilter] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [result,     setResult]     = useState(null)
  const [search,     setSearch]     = useState('')
  const [sortKey,    setSortKey]    = useState('dealDate')
  const [sortDir,    setSortDir]    = useState('desc')
  const [activeTab,  setActiveTab]  = useState('table')   // 'table' | 'summary'

  // When switching exchange, reset dealType to a sensible default
  useEffect(() => {
    if (exchange === 'BSE' && !['both', '1', '2'].includes(dealType)) setDealType('both')
    if (exchange === 'NSE' && !['bulk_deals', 'block_deals', 'short_deals'].includes(dealType)) setDealType('bulk_deals')
  }, [exchange])

  function applyQuickRange(r) {
    setFromDate(r.from()); setToDate(r.to()); setResult(null); setError(null)
  }

  async function fetchDeals() {
    if (!fromDate || !toDate) { setError('Select valid From and To dates.'); return }
    if (fromDate > toDate)    { setError('From date must not be after To date.'); return }
    setLoading(true); setError(null); setSearch('')
    try {
      if (exchange === 'BSE') {
        const params = new URLSearchParams({ from: toYYYYMMDD(fromDate), to: toYYYYMMDD(toDate), dealType })
        const data = await apiClient(`/api/bse/deals?${params}`)
        setResult(data)
      } else {
        // NSE mapping
        const formatDateForNSE = (d) => {
          const parts = d.split('-'); // YYYY-MM-DD
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        const params = new URLSearchParams({ 
          from: formatDateForNSE(fromDate), 
          to: formatDateForNSE(toDate), 
          dealType: dealType 
        })
        const data = await apiClient(`/api/nse/deals?${params}`)
        
        let deals = []
        if (data && data.data && Array.isArray(data.data)) {
          deals = data.data.map(d => {
            const price = parseFloat(d.BD_TP_WATP) || 0
            const qty = parseFloat(d.BD_QTY_TRD) || 0
            const valueCr = (price * qty) / 10000000
            
            return {
              dealDate: d.BD_DT_DATE,
              dealType: dealType === 'bulk_deals' ? 'Bulk' : dealType === 'block_deals' ? 'Block' : 'Short',
              bseCode: d.BD_SYMBOL, // Using this field for symbol
              scripname: d.BD_SCRIP_NAME,
              clientName: d.BD_CLIENT_NAME,
              transactionCode: d.BD_BUY_SELL === 'BUY' ? 'P' : 'S',
              quantity: qty,
              price: price,
              valueCr: valueCr,
            }
          })
        }
        setResult({ deals })
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // Fetch automatically on mount
  useEffect(() => {
    fetchDeals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deals = result?.deals ?? []

  const filtered = useMemo(() => {
    let list = deals
    if (codeFilter) list = list.filter((d) => d.bseCode === codeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((d) =>
        d.scripname?.toLowerCase().includes(q) ||
        d.clientName?.toLowerCase().includes(q) ||
        d.bseCode?.includes(q)
      )
    }
    return [...list].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
      if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [deals, codeFilter, search, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const bulkCount  = filtered.filter((d) => d.dealType === 'Bulk').length
  const blockCount = filtered.filter((d) => d.dealType === 'Block').length
  const buyCount   = filtered.filter((d) => d.transactionCode === 'P').length
  const sellCount  = filtered.filter((d) => d.transactionCode === 'S').length
  const totalValue = filtered.reduce((s, d) => s + (d.valueCr || 0), 0)

  // Top clients by value
  const topClients = useMemo(() => {
    const map = {}
    for (const d of filtered) {
      if (!d.clientName) continue
      if (!map[d.clientName]) map[d.clientName] = { name: d.clientName, buy: 0, sell: 0, totalCr: 0, count: 0 }
      map[d.clientName].totalCr += d.valueCr || 0
      map[d.clientName].count   += 1
      if (d.transactionCode === 'P') map[d.clientName].buy  += d.valueCr || 0
      else                           map[d.clientName].sell += d.valueCr || 0
    }
    return Object.values(map).sort((a, b) => b.totalCr - a.totalCr).slice(0, 10)
  }, [filtered])

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-70" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-primary" />
      : <ChevDown className="w-3 h-3 text-primary" />
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-textPrimary">Bulk &amp; Block Deals</h1>
          <p className="text-sm text-textMuted mt-0.5">Bulk (≥0.5% equity), block window deals, and short deals</p>
        </div>
        {result && (
          <button onClick={() => exportToXLSX(filtered, `bulk_block_${toYYYYMMDD(fromDate)}_${toYYYYMMDD(toDate)}.xlsx`)}
            disabled={!filtered.length}
            className="flex items-center gap-2 px-4 py-2 border border-border text-sm font-medium text-textMuted hover:text-emerald-400 hover:border-emerald-500/40 disabled:opacity-40 rounded-lg transition">
            <Download className="w-4 h-4" /> Export Excel
          </button>
        )}
      </div>

      {/* ── Filters card ── */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        {/* Quick ranges */}
        <div className="flex flex-wrap gap-2">
          {QUICK_RANGES.map((r) => (
            <button key={r.label} onClick={() => applyQuickRange(r)}
              className={clsx('text-xs px-3 py-1.5 rounded-lg border font-medium transition',
                fromDate === r.from() && toDate === r.to()
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-textMuted hover:border-primary/30 hover:text-textPrimary')}>
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-textMuted mb-1.5">From Date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="block text-xs font-medium text-textMuted mb-1.5">To Date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="block text-xs font-medium text-textMuted mb-1.5">Deal Type</label>
            <select value={dealType} onChange={(e) => setDealType(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-primary/60">
              {exchange === 'BSE' ? (
                <>
                  <option value="both">Bulk + Block</option>
                  <option value="1">Bulk only</option>
                  <option value="2">Block only</option>
                </>
              ) : (
                <>
                  <option value="bulk_deals">Bulk Deals</option>
                  <option value="block_deals">Block Deals</option>
                  <option value="short_deals">Short Deals</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-textMuted mb-1.5">Filter by Script</label>
            <ScriptSearchInput
              placeholder="Search company…"
              onSelect={(item) => setCodeFilter(item ? item.bseCode : '')}
              onClear={() => setCodeFilter('')}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-between w-full">
          <button onClick={fetchDeals} disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            {loading ? 'Fetching…' : 'Fetch Deals'}
          </button>
          
          <div className="flex items-center bg-background border border-border rounded-lg p-1">
            <button
              onClick={() => setExchange('BSE')}
              className={clsx(
                "flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-md transition-all",
                exchange === 'BSE' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
              )}
            >
              BSE
            </button>
            <button
              onClick={() => setExchange('NSE')}
              className={clsx(
                "flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-md transition-all",
                exchange === 'NSE' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
              )}
            >
              NSE
            </button>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-danger/10 border border-danger/30 rounded-xl text-sm text-danger">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-surface border border-border rounded-xl" />)}
          </div>
          <div className="h-64 bg-surface border border-border rounded-xl" />
        </div>
      )}

      {/* ── Results ── */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Total Deals"  value={filtered.length.toLocaleString()} />
            <StatCard label="Bulk"  value={bulkCount.toLocaleString()}  color="text-blue-400"   border="border-blue-800/40" />
            <StatCard label="Block" value={blockCount.toLocaleString()} color="text-violet-400" border="border-violet-800/40" />
            <StatCard label="Short" value={(filtered.length - bulkCount - blockCount).toLocaleString()} color="text-amber-400" border="border-amber-800/40" />
            <StatCard label="Buy"   value={buyCount.toLocaleString()}   color="text-emerald-400" border="border-emerald-800/40"
              sub={`${filtered.length ? ((buyCount / filtered.length) * 100).toFixed(0) : 0}% of total`} />
            <StatCard label="Sell"  value={sellCount.toLocaleString()}  color="text-red-400" border="border-red-800/40"
              sub={`₹${totalValue.toFixed(0)} Cr total value`} />
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
            {[['table', 'Deals Table'], ['summary', 'Top Clients']].map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition',
                  activeTab === key ? 'bg-primary/15 text-primary' : 'text-textMuted hover:text-textPrimary')}>
                {label}
              </button>
            ))}
          </div>

          {/* In-results search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by company name, client, or BSE code…"
              className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted focus:outline-none focus:border-primary/60" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary transition">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* ── Deals Table ── */}
          {activeTab === 'table' && (
            filtered.length === 0 ? (
              <div className="text-center py-12 text-textMuted text-sm">No deals match your filters.</div>
            ) : (
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-background/50">
                        {COLS.map((col) => (
                          <th key={col.key}
                            className={clsx('px-4 py-3 text-xs font-semibold text-textMuted whitespace-nowrap',
                              col.align === 'right' ? 'text-right' : 'text-left',
                              col.sortable && 'cursor-pointer select-none group hover:text-textPrimary')}
                            onClick={() => col.sortable && toggleSort(col.key)}>
                            <span className="flex items-center gap-1.5" style={{ justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                              {col.label}
                              {col.sortable && <SortIcon k={col.key} />}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((d, i) => (
                        <tr key={i} className={clsx(
                          'border-b border-border/40 transition-colors',
                          i % 2 === 0 ? 'hover:bg-white/3' : 'bg-background/20 hover:bg-white/4'
                        )}>
                          <td className="px-4 py-3 text-textMuted whitespace-nowrap tabular-nums">{d.dealDate}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium border',
                              d.dealType === 'Bulk'
                                ? 'bg-blue-900/40 text-blue-300 border-blue-700/50'
                                : 'bg-violet-900/40 text-violet-300 border-violet-700/50')}>
                              {d.dealType}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-textMuted">{d.bseCode}</td>
                          <td className="px-4 py-3 font-medium text-textPrimary max-w-[160px]">
                            <span className="block truncate" title={d.scripname}>{d.scripname || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-textMuted max-w-[180px]">
                            <span className="block truncate" title={d.clientName}>{d.clientName || '—'}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded',
                              d.transactionCode === 'P'
                                ? 'text-emerald-400 bg-emerald-900/30'
                                : 'text-red-400 bg-red-900/30')}>
                              {d.transactionCode === 'P'
                                ? <TrendingUp className="w-3 h-3" />
                                : <TrendingDown className="w-3 h-3" />}
                              {d.transactionType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-textPrimary tabular-nums whitespace-nowrap">
                            {d.quantity != null ? d.quantity.toLocaleString('en-IN') : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-medium text-textPrimary">
                            {d.price != null ? `₹${d.price.toFixed(2)}` : '—'}
                          </td>
                          <td className={clsx('px-4 py-3 text-right tabular-nums whitespace-nowrap font-semibold',
                            d.valueCr != null && d.valueCr > 50 ? 'text-amber-400' : 'text-textMuted')}>
                            {d.valueCr != null ? `${d.valueCr.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-border bg-background/30 flex items-center justify-between text-xs text-textMuted">
                  <span>Showing {filtered.length.toLocaleString()} of {deals.length.toLocaleString()} deals</span>
                  <span>Total value: <strong className="text-textPrimary">₹{totalValue.toFixed(2)} Cr</strong></span>
                </div>
              </div>
            )
          )}

          {/* ── Top Clients Summary ── */}
          {activeTab === 'summary' && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border bg-background/40">
                <h3 className="text-sm font-semibold text-textPrimary">Top Clients by Value (₹ Cr)</h3>
                <p className="text-xs text-textMuted mt-0.5">Across all filtered deals</p>
              </div>
              {topClients.length === 0 ? (
                <div className="p-8 text-center text-textMuted text-sm">No data</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/30">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-textMuted">#</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-textMuted">Client</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-textMuted">Deals</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-textMuted text-emerald-400">Buy (Cr)</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-textMuted text-red-400">Sell (Cr)</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-textMuted">Total (Cr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topClients.map((c, i) => (
                      <tr key={c.name} className={clsx('border-b border-border/40', i % 2 === 0 ? '' : 'bg-background/20')}>
                        <td className="px-5 py-3 text-textMuted text-xs">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-textPrimary max-w-[280px]">
                          <span className="block truncate" title={c.name}>{c.name}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-textMuted">{c.count}</td>
                        <td className="px-5 py-3 text-right text-emerald-400 tabular-nums font-medium">
                          {c.buy > 0 ? c.buy.toFixed(2) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-red-400 tabular-nums font-medium">
                          {c.sell > 0 ? c.sell.toFixed(2) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-textPrimary tabular-nums font-bold">
                          {c.totalCr.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-5">
            <Layers className="w-8 h-8 text-primary" />
          </div>
          <p className="text-textPrimary font-semibold mb-1 text-base">Browse bulk &amp; block deals</p>
          <p className="text-sm text-textMuted max-w-xs">
            Select a date range and deal type, then click <strong>Fetch Deals</strong>.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {QUICK_RANGES.map((r) => (
              <button key={r.label} onClick={() => applyQuickRange(r)}
                className="text-xs px-3 py-1.5 border border-border text-textMuted hover:border-primary/40 hover:text-textPrimary rounded-lg transition">
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
