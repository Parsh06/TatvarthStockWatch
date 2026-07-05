import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Plus, Trash2, RefreshCw, Download, ChevronDown, ChevronUp,
  X, Info, Briefcase, ArrowUpRight, ArrowDownRight, BarChart2,
  TrendingUp, TrendingDown, Clock, Target, Activity, Upload,
  CloudOff, Cloud,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import ScriptSearchInput from '../Common/ScriptSearchInput'
import { lsLoad, lsSave, loadPortfolio, debouncedSave } from '../../services/portfolioService.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { fmtN, fmtInr, fmtPct } from '../../utils/formatters.js'

const BACKEND = import.meta.env.VITE_BACKEND_URL || ''

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function daysSince(isoDate) {
  if (!isoDate) return null
  const diff = Date.now() - new Date(isoDate).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

function annualizedReturn(pnlPct, days) {
  if (!days || days < 1 || pnlPct == null) return null
  return ((1 + pnlPct / 100) ** (365 / days) - 1) * 100
}

// ── Portfolio math ────────────────────────────────────────────────────────────

function computeHolding(h, quote) {
  const buys  = h.transactions.filter(t => t.type === 'BUY')
  const sells = h.transactions.filter(t => t.type === 'SELL')

  const totalBuyQty  = buys.reduce( (s, t) => s + t.qty, 0)
  const totalSellQty = sells.reduce((s, t) => s + t.qty, 0)
  const netQty       = totalBuyQty - totalSellQty

  const totalBuyValue  = buys.reduce( (s, t) => s + t.qty * t.price, 0)
  const totalSellValue = sells.reduce((s, t) => s + t.qty * t.price, 0)

  const avgBuyPrice   = totalBuyQty > 0 ? totalBuyValue / totalBuyQty : 0
  const investedValue = avgBuyPrice * netQty
  const realizedPnL   = totalSellValue - avgBuyPrice * totalSellQty

  const ltp           = quote?.ltp ?? null
  const currentValue  = ltp != null && netQty > 0 ? ltp * netQty : null
  const unrealizedPnL = currentValue != null ? currentValue - investedValue : null
  const unrealizedPct = unrealizedPnL != null && investedValue > 0
    ? (unrealizedPnL / investedValue) * 100 : null

  // Day's gain = netQty × today's price change
  const todayGain = quote?.change != null && netQty > 0 ? quote.change * netQty : null
  const todayGainPct = todayGain != null && currentValue != null && (currentValue - todayGain) > 0
    ? (todayGain / (currentValue - todayGain)) * 100 : null

  // Oldest buy date
  const oldestDate = buys.length
    ? buys.reduce((min, t) => t.date < min ? t.date : min, buys[0].date)
    : null

  return {
    totalBuyQty, totalSellQty, netQty,
    totalBuyValue, totalSellValue,
    avgBuyPrice, investedValue, realizedPnL,
    ltp, currentValue, unrealizedPnL, unrealizedPct,
    todayGain, todayGainPct,
    change:    quote?.change    ?? null,
    pctChange: quote?.pctChange ?? null,
    prevClose: quote?.prevClose ?? null,
    open:      quote?.open      ?? null,
    high:      quote?.high      ?? null,
    low:       quote?.low       ?? null,
    oldestDate,
  }
}

function computeTotals(holdings, quotes) {
  let totalInvested = 0, totalCurrent = 0, totalRealized = 0, liveCount = 0
  let totalTodayGain = 0, hasTodayGain = false

  for (const h of holdings) {
    const c = computeHolding(h, quotes[h.bseCode])
    if (c.netQty <= 0) continue
    totalInvested += c.investedValue
    totalRealized += c.realizedPnL
    if (c.currentValue != null) { totalCurrent += c.currentValue; liveCount++ }
    if (c.todayGain != null) { totalTodayGain += c.todayGain; hasTodayGain = true }
  }

  const unrealizedPnL = liveCount > 0 ? totalCurrent - totalInvested : null
  const unrealizedPct = unrealizedPnL != null && totalInvested > 0
    ? (unrealizedPnL / totalInvested) * 100 : null
  const totalPnL = unrealizedPnL != null ? unrealizedPnL + totalRealized : null
  const totalPct = totalPnL != null && totalInvested > 0
    ? (totalPnL / totalInvested) * 100 : null

  return {
    totalInvested, totalCurrent, totalRealized,
    unrealizedPnL, unrealizedPct, totalPnL, totalPct,
    liveCount,
    todayGain: hasTodayGain ? totalTodayGain : null,
  }
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, sub2, positive, negative, icon: Icon, accent }) {
  const borderCol = positive ? 'border-emerald-500/25' : negative ? 'border-red-500/25' : accent ? `border-${accent}/20` : 'border-border'
  const textCol   = positive ? 'text-emerald-400'      : negative ? 'text-red-400'      : 'text-textPrimary'
  return (
    <div className={clsx('bg-surface border rounded-xl p-4 flex flex-col gap-1 relative overflow-hidden', borderCol)}>
      {Icon && <Icon className={clsx('absolute right-3 top-3 w-8 h-8 opacity-5', positive ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-primary')} />}
      <p className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">{label}</p>
      <p className={clsx('text-xl font-bold leading-tight tabular-nums', textCol)}>{value}</p>
      {sub  && <p className={clsx('text-xs', positive ? 'text-emerald-400/70' : negative ? 'text-red-400/70' : 'text-textMuted/70')}>{sub}</p>}
      {sub2 && <p className="text-xs text-textMuted/50">{sub2}</p>}
    </div>
  )
}

// ── Allocation chart ──────────────────────────────────────────────────────────

const PALETTE = [
  '#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e',
  '#a78bfa','#34d399','#fb923c','#60a5fa','#e879f9',
]

function AllocationSection({ holdings, quotes }) {
  const items = holdings
    .map((h, i) => {
      const c = computeHolding(h, quotes[h.bseCode])
      return { name: h.scripName, code: h.bseCode, invested: c.investedValue, current: c.currentValue ?? c.investedValue, color: PALETTE[i % PALETTE.length] }
    })
    .filter(x => x.invested > 0)
    .sort((a, b) => b.invested - a.invested)

  const totalInvested = items.reduce((s, x) => s + x.invested, 0)
  const totalCurrent  = items.reduce((s, x) => s + x.current, 0)
  if (!totalInvested || !items.length) return null

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-textPrimary mb-4 flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-primary" /> Portfolio Allocation
      </h3>

      {/* Stacked bar — invested */}
      <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-1.5">By Investment</p>
      <div className="flex h-4 rounded-full overflow-hidden mb-1" style={{ gap: '1px' }}>
        {items.map(item => (
          <div key={item.code}
            title={`${item.name}: ${(item.invested / totalInvested * 100).toFixed(1)}%`}
            style={{ width: `${(item.invested / totalInvested * 100).toFixed(2)}%`, backgroundColor: item.color }}
            className="h-full"
          />
        ))}
      </div>

      {/* Stacked bar — current */}
      <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-1.5 mt-3">By Current Value</p>
      <div className="flex h-4 rounded-full overflow-hidden mb-4" style={{ gap: '1px' }}>
        {items.map(item => (
          <div key={item.code}
            title={`${item.name}: ${(item.current / totalCurrent * 100).toFixed(1)}%`}
            style={{ width: `${(item.current / totalCurrent * 100).toFixed(2)}%`, backgroundColor: item.color }}
            className="h-full"
          />
        ))}
      </div>

      {/* Legend table */}
      <div className="space-y-2">
        {items.map(item => {
          const investPct  = item.invested / totalInvested * 100
          const currentPct = item.current  / totalCurrent  * 100
          return (
            <div key={item.code} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-0.5" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-textPrimary truncate flex-1 min-w-0">{item.name}</span>
              <span className="text-xs text-textMuted tabular-nums flex-shrink-0 w-16 text-right">{fmtInr(item.invested)}</span>
              <span className="text-xs font-semibold text-textPrimary tabular-nums flex-shrink-0 w-10 text-right">{investPct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Add Transaction Modal ─────────────────────────────────────────────────────

function AddTransactionModal({ onClose, onAdd, prefillHolding, prefillQuote }) {
  const [step, setStep]               = useState(prefillHolding ? 'form' : 'search')
  const [script, setScript]           = useState(prefillHolding || null)
  const [liveQuote, setLiveQuote]     = useState(prefillQuote   || null)
  const [quoteLoading, setQL]         = useState(false)
  const [type, setType]               = useState('BUY')
  const [qty, setQty]                 = useState('')
  const [price, setPrice]             = useState(prefillQuote?.ltp ? String(prefillQuote.ltp) : '')
  const [priceEdited, setPriceEdited] = useState(false)
  const [date, setDate]               = useState(todayISO())
  const [note, setNote]               = useState('')

  const livePrice = liveQuote?.ltp ?? null

  // Fetch quote whenever script changes
  useEffect(() => {
    if (!script?.bseCode) return
    let cancelled = false
    setQL(true)
    fetch(`${BACKEND}/api/bse/quote?codes=${script.bseCode}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const q = d.quotes?.[script.bseCode]
        setLiveQuote(q || null)
        if (q?.ltp && !priceEdited) setPrice(String(q.ltp))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setQL(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script?.bseCode])

  const total = useMemo(() => {
    const q = parseFloat(qty), p = parseFloat(price)
    return !isNaN(q) && !isNaN(p) && q > 0 && p > 0 ? q * p : null
  }, [qty, price])

  const priceMatchesLive = livePrice != null && price !== '' && Math.abs(parseFloat(price) - livePrice) < 0.01

  function handlePick(item) {
    if (!item) return
    setScript(item)
    setLiveQuote(null)
    setPrice('')
    setPriceEdited(false)
    setStep('form')
  }

  function handleUseLive() {
    if (livePrice) { setPrice(String(livePrice)); setPriceEdited(false) }
  }

  function handleSubmit() {
    if (!script) return toast.error('Select a company first')
    const q = parseFloat(qty), p = parseFloat(price)
    if (isNaN(q) || q <= 0) return toast.error('Enter a valid quantity')
    if (isNaN(p) || p <= 0) return toast.error('Enter a valid price')
    if (!date) return toast.error('Select a date')
    onAdd({ script, tx: { id: genId('tx'), type, qty: q, price: p, date, note: note.trim() } })
    onClose()
  }

  const chgPos = liveQuote?.pctChange != null && liveQuote.pctChange >= 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      {/* KEY FIX: no overflow-hidden on outer wrapper — allows dropdown to overflow */}
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
           style={{ maxHeight: '92vh' }}>

        {/* Header — rounded top */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0 rounded-t-2xl bg-surface">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-textPrimary">
              {step === 'search' ? 'Add Investment' : 'Transaction Details'}
            </h2>
            {step === 'form' && script && (
              <p className="text-xs text-textMuted mt-0.5 truncate">{script.scripName} · BSE {script.bseCode}</p>
            )}
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/5 transition ml-3 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1 — Search: overflow-visible so dropdown shows */}
        {step === 'search' && (
          <div className="px-5 py-5 space-y-3" style={{ overflow: 'visible' }}>
            <p className="text-sm text-textMuted">Search for any BSE-listed company.</p>
            {/* Extra wrapper with min-height so dropdown has room */}
            <div style={{ minHeight: '280px', overflow: 'visible', position: 'relative' }}>
              <ScriptSearchInput
                placeholder="Company name, symbol or BSE code…"
                onSelect={handlePick}
                className="w-full"
              />
            </div>
            <p className="text-xs text-center text-textMuted/40">Powered by BSE India public data</p>
          </div>
        )}

        {/* Step 2 — Form: scrollable */}
        {step === 'form' && script && (
          <div className="overflow-y-auto flex-1">
            <div className="px-5 py-5 space-y-4">

              {/* Live price card */}
              <div className={clsx(
                'rounded-2xl border',
                liveQuote ? 'border-primary/20 bg-primary/5' : 'border-border bg-background/50'
              )}>
                {/* Company row */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {(script.scripName || '??').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-textPrimary truncate">{script.scripName}</p>
                    <p className="text-xs text-textMuted">{script.symbol ? `${script.symbol} · ` : ''}BSE {script.bseCode}</p>
                  </div>
                  {quoteLoading && (
                    <span className="flex items-center gap-1.5 text-xs text-primary/70 flex-shrink-0">
                      <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
                      Live…
                    </span>
                  )}
                </div>

                {/* Price display */}
                {liveQuote && livePrice != null ? (
                  <div className="px-4 pb-4">
                    <div className="flex items-end gap-3 flex-wrap">
                      <div>
                        <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-0.5">Live Market Price (LTP)</p>
                        <p className="text-3xl font-bold text-textPrimary tabular-nums">
                          ₹{livePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      {liveQuote.pctChange != null && (
                        <div className={clsx(
                          'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold mb-0.5',
                          chgPos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        )}>
                          {chgPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {chgPos ? '+' : ''}{fmtN(liveQuote.change)} ({fmtN(liveQuote.pctChange)}%)
                        </div>
                      )}
                    </div>
                    {(liveQuote.open || liveQuote.high || liveQuote.low || liveQuote.prevClose) && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-textMuted flex-wrap">
                        {liveQuote.prevClose && <span>Prev <span className="text-textPrimary font-medium">₹{fmtN(liveQuote.prevClose)}</span></span>}
                        {liveQuote.open      && <span>Open <span className="text-textPrimary font-medium">₹{fmtN(liveQuote.open)}</span></span>}
                        {liveQuote.high      && <span>High <span className="text-emerald-400 font-medium">₹{fmtN(liveQuote.high)}</span></span>}
                        {liveQuote.low       && <span>Low  <span className="text-red-400 font-medium">₹{fmtN(liveQuote.low)}</span></span>}
                      </div>
                    )}
                  </div>
                ) : !quoteLoading ? (
                  <p className="px-4 pb-3 text-xs text-textMuted/50 italic">Live price unavailable — enter manually below</p>
                ) : null}
              </div>

              {/* Buy / Sell toggle */}
              <div>
                <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2 block">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {['BUY', 'SELL'].map(t => (
                    <button key={t} onClick={() => setType(t)}
                      className={clsx(
                        'py-2.5 rounded-xl text-sm font-bold border transition',
                        type === t
                          ? t === 'BUY' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400' : 'bg-red-500/15 border-red-500/50 text-red-400'
                          : 'bg-background/60 border-border text-textMuted hover:text-textPrimary'
                      )}>
                      {t === 'BUY' ? '↑ BUY' : '↓ SELL'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Qty + Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2 block">Quantity</label>
                  <input
                    type="number" min="0" step="any" placeholder="e.g. 10"
                    value={qty} onChange={e => setQty(e.target.value)}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted/40 focus:outline-none focus:border-primary/60 transition"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2 block">Price / Share (₹)</label>
                  <input
                    type="number" min="0" step="any"
                    placeholder={livePrice ? fmtN(livePrice) : 'e.g. 2500'}
                    value={price}
                    onChange={e => { setPrice(e.target.value); setPriceEdited(true) }}
                    className={clsx(
                      'w-full px-3 py-2.5 bg-background border rounded-xl text-sm text-textPrimary placeholder-textMuted/40 focus:outline-none transition',
                      priceMatchesLive ? 'border-primary/50 focus:border-primary'
                        : priceEdited && livePrice ? 'border-amber-500/50 focus:border-amber-400'
                        : 'border-border focus:border-primary/60'
                    )}
                  />
                  {livePrice != null && (
                    <div className="mt-1.5 flex items-center gap-1">
                      {priceEdited && !priceMatchesLive ? (
                        <>
                          <span className="text-[10px] text-amber-400/80">Modified</span>
                          <button onClick={handleUseLive} className="text-[10px] text-primary underline">reset ₹{fmtN(livePrice)}</button>
                        </>
                      ) : priceMatchesLive ? (
                        <span className="text-[10px] text-primary/70 flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/70 inline-block" /> Live price
                        </span>
                      ) : (
                        <button onClick={handleUseLive} className="text-[10px] text-primary underline">Use live ₹{fmtN(livePrice)}</button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2 block">Transaction Date</label>
                <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-textPrimary focus:outline-none focus:border-primary/60 transition"
                />
              </div>

              {/* Note */}
              <div>
                <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2 block">
                  Note <span className="font-normal text-textMuted/50">(optional)</span>
                </label>
                <input type="text" maxLength={100} placeholder="e.g. SIP, long-term…"
                  value={note} onChange={e => setNote(e.target.value)}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted/40 focus:outline-none focus:border-primary/60 transition"
                />
              </div>

              {/* Total */}
              {total != null && (
                <div className={clsx('rounded-xl border px-4 py-3',
                  type === 'BUY' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20')}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-textMuted mb-0.5">Total {type === 'BUY' ? 'Investment' : 'Proceeds'}</p>
                      <p className={clsx('text-2xl font-bold tabular-nums', type === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>
                        {fmtInr(total, false)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-textMuted/70">
                      <p>{parseFloat(qty).toLocaleString('en-IN')} shares</p>
                      <p>× ₹{parseFloat(price).toFixed(2)}</p>
                      {livePrice && !priceMatchesLive && priceEdited && (
                        <p className="mt-1 text-amber-400/60">vs live: {fmtInr(parseFloat(qty) * livePrice, false)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pb-1">
                {!prefillHolding && (
                  <button onClick={() => setStep('search')}
                    className="px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-textMuted hover:text-textPrimary transition">
                    ← Back
                  </button>
                )}
                <button onClick={onClose}
                  className="px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-textMuted hover:text-textPrimary transition">
                  Cancel
                </button>
                <button onClick={handleSubmit}
                  className={clsx('flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition',
                    type === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500')}>
                  Add {type} Transaction
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Delete modal ──────────────────────────────────────────────────────────────

function DeleteModal({ scripName, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6 text-red-400" />
        </div>
        <h3 className="text-base font-semibold text-textPrimary text-center mb-1">Remove Holding?</h3>
        <p className="text-sm text-textMuted text-center mb-5">
          All transactions for <strong className="text-textPrimary">{scripName}</strong> will be permanently deleted.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="py-2.5 bg-background border border-border rounded-xl text-sm text-textMuted hover:text-textPrimary transition">Cancel</button>
          <button onClick={onConfirm} className="py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-semibold text-white transition">Remove</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'invested_desc', label: 'Invested ↓' },
  { value: 'pnl_desc',      label: 'P&L ↓' },
  { value: 'pnl_asc',       label: 'P&L ↑' },
  { value: 'returns_desc',  label: 'Returns ↓' },
  { value: 'name_asc',      label: 'Name A–Z' },
]

// ── CSV import modal ──────────────────────────────────────────────────────────
function BulkImportModal({ onClose, onImport }) {
  const [text, setText]     = useState('')
  const [preview, setPreview] = useState([])
  const [err, setErr]       = useState('')

  function parseCSV(raw) {
    const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return []
    const firstLower = lines[0].toLowerCase()
    const hasHeader  = firstLower.includes('bse') || firstLower.includes('code') || firstLower.includes('type')
    const rows       = hasHeader ? lines.slice(1) : lines
    return rows.map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const [bseCode, scripName, type, qty, price, date, note] = cols
      const q = parseFloat(qty), p = parseFloat(price)
      if (!bseCode || !['BUY','SELL'].includes((type||'').toUpperCase()) || isNaN(q) || isNaN(p)) return null
      return { bseCode: bseCode.trim(), scripName: scripName || bseCode, type: type.toUpperCase(), qty: q, price: p, date: date || todayISO(), note: note || '' }
    }).filter(Boolean)
  }

  function handleChange(v) {
    setText(v)
    setErr('')
    const rows = parseCSV(v)
    setPreview(rows)
  }

  function handleImport() {
    if (!preview.length) return setErr('No valid rows found. Check format.')
    onImport(preview)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-textPrimary flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Bulk Import Transactions</h2>
            <p className="text-xs text-textMuted mt-0.5">Paste CSV: BSECode, CompanyName, BUY/SELL, Qty, Price, Date(YYYY-MM-DD), Note</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/5 ml-3"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <textarea
            value={text} onChange={e => handleChange(e.target.value)}
            rows={6} placeholder={"500325,Reliance Industries,BUY,10,2500,2024-01-15,SIP\n532540,Infosys,BUY,5,1800,2024-02-01,"}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-mono text-textPrimary placeholder-textMuted/40 focus:outline-none focus:border-primary/60 resize-none transition"
          />
          {err && <p className="text-xs text-red-400">{err}</p>}
          {preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">{preview.length} transactions found</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {preview.slice(0, 20).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 bg-background rounded-lg">
                    <span className={clsx('font-bold w-8', r.type === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{r.type}</span>
                    <span className="text-textPrimary flex-1 truncate">{r.scripName}</span>
                    <span className="text-textMuted font-mono">{r.qty} × ₹{r.price}</span>
                    <span className="text-textMuted/50">{r.date}</span>
                  </div>
                ))}
                {preview.length > 20 && <p className="text-xs text-center text-textMuted/50">…and {preview.length - 20} more</p>}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-textMuted hover:text-textPrimary transition">Cancel</button>
          <button onClick={handleImport} disabled={!preview.length}
            className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 rounded-xl text-sm font-semibold text-white transition">
            Import {preview.length > 0 ? `${preview.length} Transactions` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { currentUser }             = useAuth()
  const location                    = useLocation()
  const uid                         = currentUser?.uid || 'DEMO_USER'
  const [holdings, setHoldings]     = useState([])
  const [syncState, setSyncState]   = useState('idle') // 'idle' | 'syncing' | 'synced' | 'error'
  const [quotes, setQuotes]         = useState({})
  const [qLoading, setQLoading]     = useState(false)
  const [qAt, setQAt]               = useState(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [addFor, setAddFor]         = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [deleteId, setDeleteId]     = useState(null)
  const [sortBy, setSortBy]         = useState('invested_desc')
  const [showImport, setShowImport] = useState(false)

  // Load: L1 (localStorage) immediately, then L2 (backend) reconcile
  useEffect(() => {
    const local = lsLoad()
    if (local?.holdings?.length) setHoldings(local.holdings)
    setSyncState('syncing')
    loadPortfolio(uid)
      .then(remote => {
        if (!remote?.holdings) return
        // Use whichever is newer or has more holdings (simple merge strategy)
        const localUpdatedAt  = local?.updatedAt  ? new Date(local.updatedAt).getTime()  : 0
        const remoteUpdatedAt = remote.updatedAt  ? new Date(remote.updatedAt).getTime() : 0
        const winner = remoteUpdatedAt >= localUpdatedAt ? remote.holdings : (local?.holdings ?? [])
        setHoldings(winner)
        lsSave({ holdings: winner, updatedAt: remote.updatedAt })
        setSyncState('synced')
      })
      .catch(() => setSyncState('error'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Open Add modal when navigated from Company Data page
  useEffect(() => {
    const { addScript: navScript, liveQuote: navQuote } = location.state || {}
    if (navScript?.bseCode) {
      setAddFor(navScript)
      if (navQuote) setQuotes(prev => ({ ...prev, [navScript.bseCode]: navQuote }))
      setShowAdd(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function persist(next) {
    setHoldings(next)
    const data = { holdings: next, updatedAt: new Date().toISOString() }
    lsSave(data)
    setSyncState('syncing')
    debouncedSave(uid, data, 2000)
    // Optimistically mark synced after debounce
    setTimeout(() => setSyncState('synced'), 2500)
  }

  const doFetchQuotes = useCallback(async (src) => {
    const codes = [...new Set((src || holdings).map(h => h.bseCode))].filter(Boolean)
    if (!codes.length) return
    setQLoading(true)
    try {
      const r = await fetch(`${BACKEND}/api/bse/quote?codes=${codes.join(',')}`)
      if (!r.ok) throw new Error(r.statusText)
      const d = await r.json()
      if (d.quotes) { setQuotes(d.quotes); setQAt(new Date()) }
    } catch { toast.error('Could not fetch live prices') }
    finally { setQLoading(false) }
  }, [holdings])

  useEffect(() => {
    if (holdings.length > 0) doFetchQuotes(holdings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length])

  function handleAdd({ script, tx }) {
    const existing = holdings.find(h => h.bseCode === script.bseCode)
    const next = existing
      ? holdings.map(h => h.bseCode === script.bseCode ? { ...h, transactions: [...h.transactions, tx] } : h)
      : [...holdings, { id: genId('ph'), bseCode: script.bseCode, scripName: script.scripName, symbol: script.symbol || '', isin: script.isin || '', transactions: [tx] }]
    persist(next)
    toast.success(`${tx.type} recorded — ${script.scripName}`)
    if (!quotes[script.bseCode]) doFetchQuotes(next)
  }

  function handleRemoveTx(holdingId, txId) {
    const next = holdings
      .map(h => h.id !== holdingId ? h : { ...h, transactions: h.transactions.filter(t => t.id !== txId) })
      .filter(h => h.transactions.length > 0)
    persist(next)
    toast.success('Transaction removed')
  }

  function handleRemoveHolding(id) {
    persist(holdings.filter(h => h.id !== id))
    setDeleteId(null); setExpandedId(null)
    toast.success('Holding removed')
  }

  function handleExportCsv() {
    // Transaction-level export (one row per transaction)
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = 'Company,BSE Code,Symbol,ISIN,Type,Qty,Price,Date,Note,Transaction Value\n'
    const lines = holdings.flatMap(h =>
      h.transactions.map(t => [
        q(h.scripName), q(h.bseCode), q(h.symbol), q(h.isin),
        q(t.type), q(t.qty), q(t.price), q(t.date), q(t.note || ''),
        q((t.qty * t.price).toFixed(2))
      ].join(','))
    )
    const blob = new Blob(['﻿' + header + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = `portfolio_transactions_${todayISO()}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  function handleBulkImport(rows) {
    let next = [...holdings]
    rows.forEach(r => {
      const tx = { id: genId('tx'), type: r.type, qty: r.qty, price: r.price, date: r.date, note: r.note }
      const existing = next.find(h => h.bseCode === r.bseCode)
      if (existing) {
        next = next.map(h => h.bseCode === r.bseCode ? { ...h, transactions: [...h.transactions, tx] } : h)
      } else {
        next.push({ id: genId('ph'), bseCode: r.bseCode, scripName: r.scripName, symbol: '', isin: '', transactions: [tx] })
      }
    })
    persist(next)
    toast.success(`Imported ${rows.length} transactions`)
    doFetchQuotes(next)
  }

  // Derived
  const totals = useMemo(() => computeTotals(holdings, quotes), [holdings, quotes])

  const activeHoldings = useMemo(() => {
    const active = holdings.filter(h => computeHolding(h, quotes[h.bseCode]).netQty > 0)
    return [...active].sort((a, b) => {
      const ca = computeHolding(a, quotes[a.bseCode])
      const cb = computeHolding(b, quotes[b.bseCode])
      if (sortBy === 'invested_desc') return cb.investedValue - ca.investedValue
      if (sortBy === 'pnl_desc')      return (cb.unrealizedPnL ?? -Infinity) - (ca.unrealizedPnL ?? -Infinity)
      if (sortBy === 'pnl_asc')       return (ca.unrealizedPnL ?? Infinity)  - (cb.unrealizedPnL ?? Infinity)
      if (sortBy === 'returns_desc')   return (cb.unrealizedPct ?? -Infinity) - (ca.unrealizedPct ?? -Infinity)
      if (sortBy === 'name_asc')       return a.scripName.localeCompare(b.scripName)
      return 0
    })
  }, [holdings, quotes, sortBy])

  const closedHoldings = useMemo(
    () => holdings.filter(h => computeHolding(h, quotes[h.bseCode]).netQty <= 0),
    [holdings, quotes]
  )

  // Best and worst performer
  const performers = useMemo(() => {
    const ranked = activeHoldings
      .map(h => ({ h, c: computeHolding(h, quotes[h.bseCode]) }))
      .filter(x => x.c.unrealizedPct != null)
      .sort((a, b) => (b.c.unrealizedPct ?? 0) - (a.c.unrealizedPct ?? 0))
    return { best: ranked[0] ?? null, worst: ranked[ranked.length - 1] ?? null }
  }, [activeHoldings, quotes])

  return (
    <div className="space-y-5">

      {/* Modals */}
      {showAdd && (
        <AddTransactionModal
          onClose={() => { setShowAdd(false); setAddFor(null) }}
          onAdd={handleAdd}
          prefillHolding={addFor}
          prefillQuote={addFor ? (quotes[addFor.bseCode] ?? null) : null}
        />
      )}
      {deleteId && (
        <DeleteModal
          scripName={holdings.find(h => h.id === deleteId)?.scripName}
          onCancel={() => setDeleteId(null)}
          onConfirm={() => handleRemoveHolding(deleteId)}
        />
      )}
      {showImport && (
        <BulkImportModal
          onClose={() => setShowImport(false)}
          onImport={handleBulkImport}
        />
      )}

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-textPrimary flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" /> Portfolio
            {/* Sync status indicator */}
            {syncState === 'syncing' && (
              <span className="flex items-center gap-1 text-[10px] text-primary/60 font-normal">
                <span className="w-2.5 h-2.5 border-2 border-primary/50 border-t-transparent rounded-full animate-spin inline-block" /> Syncing
              </span>
            )}
            {syncState === 'synced' && <Cloud className="w-3.5 h-3.5 text-emerald-400/60" title="Saved to backend" />}
            {syncState === 'error'  && <CloudOff className="w-3.5 h-3.5 text-amber-400/60" title="Sync error — data in browser" />}
          </h1>
          <p className="text-sm text-textMuted mt-0.5">
            Synced to backend — safe across devices &amp; refreshes.
            {qAt && <span className="ml-1.5 opacity-50">Prices {qAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {holdings.length > 0 && (
            <button onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-textMuted hover:text-textPrimary hover:border-primary/40 transition">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-textMuted hover:text-textPrimary hover:border-primary/40 transition">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          {holdings.length > 0 && (
            <button onClick={() => doFetchQuotes()} disabled={qLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-textMuted hover:text-textPrimary hover:border-primary/40 disabled:opacity-50 transition">
              <RefreshCw className={clsx('w-3.5 h-3.5', qLoading && 'animate-spin')} />
              {qLoading ? 'Updating…' : 'Refresh'}
            </button>
          )}
          <button onClick={() => { setAddFor(null); setShowAdd(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition">
            <Plus className="w-4 h-4" /> Add Investment
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      {activeHoldings.length > 0 && (
        <>
          {/* Row 1: main metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard
              label="Invested" icon={Briefcase}
              value={fmtInr(totals.totalInvested)}
              sub={`${activeHoldings.length} holding${activeHoldings.length !== 1 ? 's' : ''}`}
            />
            <SummaryCard
              label="Current Value" icon={Activity}
              value={totals.liveCount > 0 ? fmtInr(totals.totalCurrent) : '—'}
              sub={totals.liveCount > 0 ? `${totals.liveCount} live` : 'No data'}
            />
            <SummaryCard
              label="Unrealized P&L" icon={totals.unrealizedPnL != null && totals.unrealizedPnL >= 0 ? TrendingUp : TrendingDown}
              value={totals.unrealizedPnL != null ? `${totals.unrealizedPnL >= 0 ? '+' : ''}${fmtInr(totals.unrealizedPnL)}` : '—'}
              sub={totals.unrealizedPct != null ? fmtPct(totals.unrealizedPct) : undefined}
              positive={totals.unrealizedPnL != null && totals.unrealizedPnL > 0}
              negative={totals.unrealizedPnL != null && totals.unrealizedPnL < 0}
            />
            <SummaryCard
              label="Realized P&L" icon={Target}
              value={`${totals.totalRealized >= 0 ? '+' : ''}${fmtInr(totals.totalRealized)}`}
              sub="closed positions"
              positive={totals.totalRealized > 0}
              negative={totals.totalRealized < 0}
            />
            <SummaryCard
              label="Today's Gain" icon={Clock}
              value={totals.todayGain != null ? `${totals.todayGain >= 0 ? '+' : ''}${fmtInr(totals.todayGain)}` : '—'}
              sub="based on day change"
              positive={totals.todayGain != null && totals.todayGain > 0}
              negative={totals.todayGain != null && totals.todayGain < 0}
            />
            <SummaryCard
              label="Overall Returns"
              value={totals.totalPct != null ? fmtPct(totals.totalPct) : '—'}
              sub={totals.totalPnL != null ? `${totals.totalPnL >= 0 ? '+' : ''}${fmtInr(totals.totalPnL)} total` : undefined}
              positive={totals.totalPct != null && totals.totalPct > 0}
              negative={totals.totalPct != null && totals.totalPct < 0}
            />
          </div>

          {/* Row 2: best/worst + quick analysis */}
          {(performers.best || performers.worst) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {performers.best && (
                <div className="bg-surface border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Best Performer</p>
                    <p className="text-sm font-semibold text-textPrimary truncate">{performers.best.h.scripName}</p>
                    <p className="text-xs text-emerald-400 font-medium">{fmtPct(performers.best.c.unrealizedPct)} · {fmtInr(performers.best.c.unrealizedPnL)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-textMuted">LTP</p>
                    <p className="text-sm font-bold text-textPrimary">₹{fmtN(performers.best.c.ltp)}</p>
                  </div>
                </div>
              )}
              {performers.worst && performers.worst.h.id !== performers.best?.h.id && (
                <div className="bg-surface border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <TrendingDown className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Worst Performer</p>
                    <p className="text-sm font-semibold text-textPrimary truncate">{performers.worst.h.scripName}</p>
                    <p className="text-xs text-red-400 font-medium">{fmtPct(performers.worst.c.unrealizedPct)} · {fmtInr(performers.worst.c.unrealizedPnL)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-textMuted">LTP</p>
                    <p className="text-sm font-bold text-textPrimary">₹{fmtN(performers.worst.c.ltp)}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Allocation chart */}
      {activeHoldings.length > 1 && <AllocationSection holdings={activeHoldings} quotes={quotes} />}

      {/* Holdings table */}
      {activeHoldings.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-border bg-background/40">
            <h2 className="text-sm font-semibold text-textPrimary">
              Active Holdings ({activeHoldings.length})
              {qLoading && <span className="ml-2 inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin align-middle" />}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-textMuted">Sort:</span>
              <select
                value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-textPrimary focus:outline-none focus:border-primary/60 cursor-pointer">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/20">
                  {['Company', 'Avg Cost', 'Qty', 'LTP', 'Day Chg%', 'Invested', 'Current', 'Unrlz P&L', 'Returns', 'Today Gain', ''].map(col => (
                    <th key={col} className="text-left px-4 py-2.5 text-xs font-semibold text-textMuted whitespace-nowrap first:pl-5 last:w-8">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeHoldings.map(h => {
                  const c      = computeHolding(h, quotes[h.bseCode])
                  const isOpen = expandedId === h.id
                  const pPos   = c.unrealizedPnL != null && c.unrealizedPnL >= 0
                  const days   = daysSince(c.oldestDate)
                  const xirr   = annualizedReturn(c.unrealizedPct, days)

                  return (
                    <Fragment key={h.id}>
                      <tr onClick={() => setExpandedId(isOpen ? null : h.id)}
                        className={clsx('border-b border-border/40 cursor-pointer transition group',
                          isOpen ? 'bg-primary/[0.03]' : 'hover:bg-white/[0.02]')}>

                        <td className="px-4 py-3 pl-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-primary">
                                {(h.scripName || '??').slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-textPrimary font-medium leading-tight truncate max-w-[150px]">{h.scripName}</p>
                              <p className="text-xs text-textMuted font-mono mt-0.5">{h.bseCode}{h.symbol ? ` · ${h.symbol}` : ''}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 tabular-nums text-textMuted text-sm">₹{fmtN(c.avgBuyPrice)}</td>
                        <td className="px-4 py-3 tabular-nums text-textPrimary font-semibold">{c.netQty}</td>

                        <td className="px-4 py-3 tabular-nums font-bold text-textPrimary">
                          {c.ltp != null ? `₹${fmtN(c.ltp)}` : <span className="text-textMuted/50 font-normal text-xs">—</span>}
                        </td>

                        <td className={clsx('px-4 py-3 tabular-nums text-xs whitespace-nowrap',
                          c.pctChange == null ? 'text-textMuted' : c.pctChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {c.pctChange != null ? (
                            <span className={clsx('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-semibold',
                              c.pctChange >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
                              {c.pctChange >= 0 ? '▲' : '▼'} {Math.abs(c.pctChange).toFixed(2)}%
                            </span>
                          ) : '—'}
                        </td>

                        <td className="px-4 py-3 tabular-nums text-textMuted">{fmtInr(c.investedValue)}</td>
                        <td className="px-4 py-3 tabular-nums text-textPrimary font-medium">{c.currentValue != null ? fmtInr(c.currentValue) : '—'}</td>

                        <td className={clsx('px-4 py-3 tabular-nums font-semibold whitespace-nowrap',
                          c.unrealizedPnL == null ? 'text-textMuted' : pPos ? 'text-emerald-400' : 'text-red-400')}>
                          {c.unrealizedPnL != null ? (
                            <span className="flex items-center gap-0.5">
                              {pPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                              {pPos ? '+' : ''}{fmtInr(c.unrealizedPnL)}
                            </span>
                          ) : '—'}
                        </td>

                        <td className={clsx('px-4 py-3 tabular-nums font-semibold',
                          c.unrealizedPct == null ? 'text-textMuted' : c.unrealizedPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {c.unrealizedPct != null ? fmtPct(c.unrealizedPct) : '—'}
                        </td>

                        <td className={clsx('px-4 py-3 tabular-nums text-xs font-medium',
                          c.todayGain == null ? 'text-textMuted' : c.todayGain >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {c.todayGain != null ? `${c.todayGain >= 0 ? '+' : ''}${fmtInr(c.todayGain)}` : '—'}
                        </td>

                        <td className="pr-4">
                          {isOpen ? <ChevronUp className="w-4 h-4 text-textMuted inline" />
                                  : <ChevronDown className="w-4 h-4 text-textMuted group-hover:text-textPrimary inline transition" />}
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isOpen && (
                        <tr className="bg-background/40 border-b border-border/40">
                          <td colSpan={11} className="px-5 py-4">

                            {/* Stats strip */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                              <div className="bg-surface border border-border/60 rounded-xl px-3 py-2.5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wide mb-0.5">Holding Period</p>
                                <p className="text-sm font-semibold text-textPrimary">{days != null ? `${days} days` : '—'}</p>
                                <p className="text-xs text-textMuted">{c.oldestDate || '—'}</p>
                              </div>
                              <div className="bg-surface border border-border/60 rounded-xl px-3 py-2.5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wide mb-0.5">Ann. Return</p>
                                <p className={clsx('text-sm font-semibold', xirr == null ? 'text-textMuted' : xirr >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                  {xirr != null ? fmtPct(xirr) : '—'}
                                </p>
                                <p className="text-xs text-textMuted">approx.</p>
                              </div>
                              <div className="bg-surface border border-border/60 rounded-xl px-3 py-2.5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wide mb-0.5">Realized P&L</p>
                                <p className={clsx('text-sm font-semibold', c.realizedPnL === 0 ? 'text-textMuted' : c.realizedPnL > 0 ? 'text-emerald-400' : 'text-red-400')}>
                                  {c.realizedPnL !== 0 ? `${c.realizedPnL > 0 ? '+' : ''}${fmtInr(c.realizedPnL)}` : '—'}
                                </p>
                                <p className="text-xs text-textMuted">{c.totalSellQty} sold</p>
                              </div>
                              <div className="bg-surface border border-border/60 rounded-xl px-3 py-2.5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wide mb-0.5">Today's Gain</p>
                                <p className={clsx('text-sm font-semibold', c.todayGain == null ? 'text-textMuted' : c.todayGain >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                  {c.todayGain != null ? `${c.todayGain >= 0 ? '+' : ''}${fmtInr(c.todayGain)}` : '—'}
                                </p>
                                {c.pctChange != null && <p className="text-xs text-textMuted">{fmtPct(c.pctChange)} day chg</p>}
                              </div>
                            </div>

                            {/* OHLC row */}
                            {(c.prevClose || c.open || c.high || c.low) && (
                              <div className="flex items-center gap-5 text-xs mb-4 px-1 flex-wrap">
                                {c.prevClose && <span className="text-textMuted">Prev Close <span className="text-textPrimary font-semibold">₹{fmtN(c.prevClose)}</span></span>}
                                {c.open      && <span className="text-textMuted">Open <span className="text-textPrimary font-semibold">₹{fmtN(c.open)}</span></span>}
                                {c.high      && <span className="text-textMuted">High <span className="text-emerald-400 font-semibold">₹{fmtN(c.high)}</span></span>}
                                {c.low       && <span className="text-textMuted">Low <span className="text-red-400 font-semibold">₹{fmtN(c.low)}</span></span>}
                              </div>
                            )}

                            {/* Transactions */}
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wide">
                                Transactions ({h.transactions.length})
                              </h4>
                              <div className="flex gap-2">
                                <button onClick={e => { e.stopPropagation(); setAddFor(h); setShowAdd(true) }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium transition">
                                  <Plus className="w-3 h-3" /> Add Tx
                                </button>
                                <button onClick={e => { e.stopPropagation(); setDeleteId(h.id) }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium transition">
                                  <Trash2 className="w-3 h-3" /> Remove
                                </button>
                              </div>
                            </div>

                            <div className="rounded-xl border border-border/50 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border/50 bg-background/60">
                                    {['Type', 'Date', 'Qty', 'Price', 'Value', 'Note', ''].map(col => (
                                      <th key={col} className="text-left px-3 py-2 font-semibold text-textMuted">{col}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...h.transactions].sort((a, b) => b.date.localeCompare(a.date)).map(tx => (
                                    <tr key={tx.id} className="border-b border-border/30 hover:bg-white/[0.02] transition">
                                      <td className="px-3 py-2.5">
                                        <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold',
                                          tx.type === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                                          {tx.type}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 text-textMuted tabular-nums">{tx.date}</td>
                                      <td className="px-3 py-2.5 text-textPrimary font-semibold tabular-nums">{tx.qty.toLocaleString('en-IN')}</td>
                                      <td className="px-3 py-2.5 text-textMuted tabular-nums">₹{fmtN(tx.price)}</td>
                                      <td className="px-3 py-2.5 text-textPrimary font-medium tabular-nums">{fmtInr(tx.qty * tx.price)}</td>
                                      <td className="px-3 py-2.5 text-textMuted/60 italic max-w-[140px] truncate">{tx.note || '—'}</td>
                                      <td className="px-3 py-2.5 text-right">
                                        <button onClick={e => { e.stopPropagation(); handleRemoveTx(h.id, tx.id) }}
                                          className="p-1 rounded text-textMuted/30 hover:text-red-400 hover:bg-red-500/10 transition">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed positions */}
      {closedHoldings.length > 0 && (
        <div className="bg-surface border border-border/40 rounded-xl overflow-hidden opacity-70">
          <div className="px-5 py-3.5 border-b border-border/40 bg-background/20">
            <h2 className="text-sm font-semibold text-textMuted">Closed / Exited Positions ({closedHoldings.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  {['Company', 'Bought', 'Sold', 'Avg Cost', 'Total Sell Value', 'Realized P&L', ''].map(col => (
                    <th key={col} className="text-left px-4 py-2 text-xs font-semibold text-textMuted first:pl-5">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closedHoldings.map(h => {
                  const c = computeHolding(h, quotes[h.bseCode])
                  return (
                    <tr key={h.id} className="border-b border-border/30 hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3 pl-5">
                        <p className="text-textPrimary font-medium">{h.scripName}</p>
                        <p className="text-xs text-textMuted font-mono">{h.bseCode}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-textMuted">{c.totalBuyQty} @ ₹{fmtN(c.avgBuyPrice)}</td>
                      <td className="px-4 py-3 tabular-nums text-textMuted">{c.totalSellQty}</td>
                      <td className="px-4 py-3 tabular-nums text-textMuted">₹{fmtN(c.avgBuyPrice)}</td>
                      <td className="px-4 py-3 tabular-nums text-textPrimary font-medium">{fmtInr(c.totalSellValue)}</td>
                      <td className={clsx('px-4 py-3 tabular-nums font-semibold', c.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {c.realizedPnL >= 0 ? '+' : ''}{fmtInr(c.realizedPnL)}
                      </td>
                      <td className="px-4 py-3 pr-5 text-right">
                        <button onClick={() => setDeleteId(h.id)}
                          className="p-1.5 rounded-lg text-textMuted/30 hover:text-red-400 hover:bg-red-500/10 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {holdings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-primary/30" />
          </div>
          <p className="text-base font-semibold text-textPrimary mb-1">Portfolio is empty</p>
          <p className="text-sm text-textMuted mb-6 max-w-xs">
            Search any BSE-listed company, record your buy/sell transactions and start tracking P&amp;L in real time.
          </p>
          <button onClick={() => { setAddFor(null); setShowAdd(true) }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition">
            <Plus className="w-4 h-4" /> Add Your First Investment
          </button>
        </div>
      )}


    </div>
  )
}
