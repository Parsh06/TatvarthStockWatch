import { useState, useMemo, useEffect } from 'react'
import { Eye, RefreshCw, AlertCircle, Search, X, ChevronUp, ChevronDown as ChevDown, ArrowUpDown, FileText, Download } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { apiClient } from '../../services/apiClient'
import { auth } from '../../services/firebase'
import ScriptSearchInput from '../Common/ScriptSearchInput'
import Loader from '../Common/Loader'

const today        = () => new Date().toISOString().slice(0, 10)
const toYYYYMMDD   = (d) => d.replace(/-/g, '')
const dateNDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

const QUICK_RANGES = [
  { label: 'Default / Latest', from: () => '',           to: () => '' },
  { label: 'Today',            from: today,              to: today },
  { label: '3 Days',           from: () => dateNDaysAgo(2), to: today },
  { label: '1 Week',           from: () => dateNDaysAgo(6), to: today },
  { label: '1 Month',          from: () => dateNDaysAgo(29), to: today },
]

const COLS = [
  { key: 'dateIntimation',   label: 'Date',         align: 'left',  sortable: true },
  { key: 'bseCode',          label: 'Code',         align: 'left',  sortable: false },
  { key: 'companyName',      label: 'Company',      align: 'left',  sortable: true },
  { key: 'promoterName',     label: 'Person / Entity', align: 'left', sortable: true },
  { key: 'category',         label: 'Category',     align: 'left',  sortable: true },
  { key: 'transactionType',  label: 'Acq / Disp',   align: 'left',  sortable: true },
  { key: 'mode',             label: 'Mode',         align: 'left',  sortable: true },
  { key: 'securityNo',       label: 'Quantity',     align: 'right', sortable: true },
  { key: 'securityValue',    label: 'Value (₹)',    align: 'right', sortable: true },
  { key: 'postShareholding', label: 'Post %',       align: 'right', sortable: true },
]

export default function InsiderTradingPage() {
  const [fromDate,    setFromDate]    = useState('')
  const [toDate,      setToDate]      = useState('')
  const [codeFilter,  setCodeFilter]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error,       setError]       = useState(null)
  const [result,      setResult]      = useState(null)
  const [search,      setSearch]      = useState('')
  const [sortKey,     setSortKey]     = useState('')
  const [sortDir,     setSortDir]     = useState('desc')

  function applyQuickRange(r) {
    setFromDate(r.from()); setToDate(r.to()); setError(null)
  }

  async function fetchTrades() {
    if (fromDate && toDate && fromDate > toDate) { setError('From date must not be after To date.'); return }
    setLoading(true); setError(null); setSearch('')
    try {
      const fromStr = fromDate ? toYYYYMMDD(fromDate) : ''
      const toStr = toDate ? toYYYYMMDD(toDate) : ''
      const params = new URLSearchParams({ from: fromStr, to: toStr, code: codeFilter })
      const data = await apiClient(`/api/bse/insider?${params}`)
      if (data?.upstreamFailure) {
        setError('BSE is currently blocking or rate-limiting requests. Try again shortly.')
        setResult(null)
        return
      }
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleDownloadCsv() {
    if (fromDate && toDate && fromDate > toDate) { setError('From date must not be after To date.'); return }
    
    setDownloading(true)
    let downloadedSuccess = false
    const fromStr = fromDate ? toYYYYMMDD(fromDate) : ''
    const toStr = toDate ? toYYYYMMDD(toDate) : ''
    const dateSuffix = (fromDate && toDate) ? `${fromDate}_to_${toDate}` : 'Latest'
    const filename = `Tatvarth_Insider_Trading_${codeFilter ? codeFilter + '_' : ''}${dateSuffix}.csv`

    try {
      // 1. Try backend download route first
      try {
        const token = await auth?.currentUser?.getIdToken(false).catch(() => null)
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const backendUrl = import.meta.env.VITE_BACKEND_URL || ''
        const res = await fetch(`${backendUrl}/api/bse/insider/download?from=${fromStr}&to=${toStr}&code=${codeFilter}`, { headers })

        if (res.ok) {
          const blob = await res.blob()
          if (blob && blob.size > 50) {
            const downloadUrl = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = downloadUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(downloadUrl)
            downloadedSuccess = true
            toast.success(`Downloaded ${filename} successfully!`)
          }
        }
      } catch (backendErr) {
        console.warn('[Backend Insider CSV route notice]:', backendErr.message)
      }

      // 2. Client-side fallback: serialize loaded trades if backend proxy unreachable
      if (!downloadedSuccess) {
        const tradesToExport = result?.insiderTrades || []
        if (tradesToExport.length === 0) {
          toast.error('No insider trades data available to download for selected range.')
          return
        }

        const headers = [
          'Security Code',
          'Security Name',
          'Name of Person',
          'Category of person',
          'Type of Securities held Prior to acquisition/Disposed)',
          'Number of Securities held Prior to acquisition/Disposed',
          '%   of  Securities held Prior to acquisition/Disposed',
          'Type of Securities Acquired/Disposed/Pledge etc.',
          'Number of Securities Acquired/Disposed/Pledge etc.',
          'Value  of Securities Acquired/Disposed/Pledge etc',
          'Transaction Type ( Buy/Sale/Pledge/Revoke/Invoke)',
          'Type of Securities held Post  acquisition/Disposed/Pledge  etc',
          'Number of Securities held Post  acquisition/Disposed/Pledge  etc',
          '% of Securities held Post  acquisition/Disposed/Pledge  etc',
          'Date of allotment / acquisition from',
          'Date of allotment / acquisition to',
          'Date of Intimation to company',
          'Mode of Acquisition',
          'Trading in Derivatives (Specify contract / Options / Futures etc)',
          'Derivative Contract Type',
          'Derivatives Specification',
          'Derivatives Number of units (contracts * lot size) Notional Value',
          'Derivatives Number of units (contracts * lot size)',
          'Derivatives Number of units (contracts * lot size) Notional Value 1',
          'Derivatives Number of units (contracts * lot size) 1',
          'Exchange on which the trade was executed',
          'Reported to Exchange'
        ]

        const rows = tradesToExport.map(t => [
          `"${(t.bseCode || '').replace(/"/g, '""')}"`,
          `"${(t.companyName || '').replace(/"/g, '""')}"`,
          `"${(t.promoterName || '').replace(/"/g, '""')}"`,
          `"${(t.category || '').replace(/"/g, '""')}"`,
          `"${(t.securityType || 'Equity').replace(/"/g, '""')}"`,
          t.securityNo || 0,
          t.preShareholding || 0,
          `"${(t.securityType || 'Equity').replace(/"/g, '""')}"`,
          t.securityNo || 0,
          t.securityValue || 0,
          `"${(t.transactionType || '').replace(/"/g, '""')}"`,
          `"${(t.securityType || 'Equity').replace(/"/g, '""')}"`,
          t.securityNo || 0,
          t.postShareholding || 0,
          `"${(t.fromDate || '').replace(/"/g, '""')}"`,
          `"${(t.toDate || '').replace(/"/g, '""')}"`,
          `"${(t.dateIntimation || '').replace(/"/g, '""')}"`,
          `"${(t.mode || '').replace(/"/g, '""')}"`,
          '""',
          '""',
          '""',
          '""',
          '""',
          '""',
          '""',
          '"BSE"',
          `"${(t.dateIntimation || '').replace(/"/g, '""')}"`
        ].join(','))

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
      }
    } catch (e) {
      console.error('[Insider CSV Download Error]', e.message)
      toast.error('Failed to download Insider Trading CSV.')
    } finally {
      setDownloading(false)
    }
  }

  // Fetch automatically on mount and whenever parameters change
  useEffect(() => {
    fetchTrades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, codeFilter])

  const trades = result?.insiderTrades ?? []

  const filtered = useMemo(() => {
    let list = trades
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((d) =>
        d.companyName?.toLowerCase().includes(q) ||
        d.promoterName?.toLowerCase().includes(q) ||
        d.bseCode?.includes(q)
      )
    }
    if (!sortKey) return list
    return [...list].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
      if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [trades, search, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-70" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-primary" />
      : <ChevDown className="w-3 h-3 text-primary" />
  }

  const totalValue = filtered.reduce((acc, t) => acc + (t.securityValue || 0), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-textPrimary flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Insider Trading
          </h1>
          <p className="text-sm text-textMuted mt-0.5">Track promoter and insider acquisition / disposal under SAST</p>
        </div>
      </div>

      {/* Filters card */}
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

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="block text-[10px] sm:text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-1.5">From Date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="block text-[10px] sm:text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-1.5">To Date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-primary/60" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] sm:text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-1.5">Filter by Script (Optional)</label>
            <ScriptSearchInput
              placeholder="Search company…"
              onSelect={(item) => setCodeFilter(item ? item.bseCode : '')}
              onClear={() => setCodeFilter('')}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={fetchTrades} disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            {loading ? 'Fetching…' : 'Fetch Data'}
          </button>

          <button onClick={handleDownloadCsv} disabled={downloading || loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-lg text-sm font-semibold transition disabled:opacity-60 shadow-sm"
            title="Download Official BSE Insider Trading CSV">
            <Download className={clsx('w-4 h-4', downloading && 'animate-bounce')} />
            {downloading ? 'Downloading...' : 'Download CSV'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-danger/10 border border-danger/30 rounded-xl text-sm text-danger">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Couldn't load data — check your connection and retry. ({error})</span>
          </div>
          <button onClick={fetchTrades} className="px-3 py-1 bg-danger/20 hover:bg-danger/30 rounded-lg text-xs font-semibold transition">
            Retry
          </button>
        </div>
      )}

      {/* Fallback Banner */}
      {result?.fallbackApplied && !loading && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl text-xs font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>No disclosures found for the selected filter — showing latest disclosures instead.</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <Loader />
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by company name, person/entity, or code…"
              className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted focus:outline-none focus:border-primary/60" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary transition">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-textMuted text-sm">
              {search ? (
                <>No results for "<strong>{search}</strong>" in the currently loaded data.</>
              ) : fromDate || toDate || codeFilter ? (
                <>No disclosures filed for the selected date or script filter.</>
              ) : (
                <>No insider trades match your filters.</>
              )}
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
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
                      <th className="px-4 py-3 text-center text-xs font-semibold text-textMuted">XBRL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d, i) => {
                      const isAcq = d.transactionType?.toLowerCase().includes('acq')
                      const isDisp = d.transactionType?.toLowerCase().includes('dispos')
                      return (
                        <tr key={i} className={clsx(
                          'border-b border-border/40 transition-colors',
                          i % 2 === 0 ? 'hover:bg-white/3' : 'bg-background/20 hover:bg-white/4'
                        )}>
                          <td className="px-4 py-3 text-textMuted whitespace-nowrap tabular-nums text-xs">{d.dateIntimation}</td>
                          <td className="px-4 py-3 font-mono text-xs text-textMuted">{d.bseCode}</td>
                          <td className="px-4 py-3 font-medium text-textPrimary max-w-[160px]">
                            <span className="block truncate" title={d.companyName}>{d.companyName || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-textPrimary max-w-[180px]">
                            <span className="block truncate font-medium text-xs" title={d.promoterName}>{d.promoterName || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-textMuted text-xs max-w-[150px]">
                            <span className="block truncate" title={d.category}>{d.category || '—'}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={clsx('text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider',
                              isAcq ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                              isDisp ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                              'bg-surface text-textMuted border border-border')}>
                              {d.transactionType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-textMuted text-xs whitespace-nowrap">{d.mode}</td>
                          <td className="px-4 py-3 text-right text-textPrimary tabular-nums whitespace-nowrap text-xs">
                            {d.securityNo ? d.securityNo.toLocaleString('en-IN') : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-textPrimary tabular-nums whitespace-nowrap text-xs">
                            {d.securityValue ? `₹${d.securityValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-textMuted tabular-nums whitespace-nowrap text-xs">
                            {d.postShareholding > 0 ? `${d.postShareholding.toFixed(2)}%` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {d.xbrlUrl ? (
                              <a href={d.xbrlUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex p-1.5 text-primary/70 hover:text-primary hover:bg-primary/10 rounded transition"
                                title="View XBRL">
                                <FileText className="w-4 h-4" />
                              </a>
                            ) : (
                              <span className="text-textMuted/30">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-border bg-background/30 flex items-center justify-between text-xs text-textMuted">
                <span>Showing {filtered.length.toLocaleString()} of {trades.length.toLocaleString()} trades</span>
                <span>Total transacted value: <strong className="text-textPrimary">₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-5">
            <Eye className="w-8 h-8 text-primary" />
          </div>
          <p className="text-textPrimary font-semibold mb-1 text-base">Browse Insider Trading Activities</p>
          <p className="text-sm text-textMuted max-w-xs">
            Select a date range and click <strong>Fetch Data</strong> to see promoter/insider acquisitions and disposals.
          </p>
        </div>
      )}
    </div>
  )
}
