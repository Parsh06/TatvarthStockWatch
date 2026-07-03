import { useState, memo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, TrendingUp, TrendingDown, Bell, BellRing, BarChart2, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { getExchangeColor, formatRelativeDate } from '../../utils/formatters'
import { useWatchlist } from '../../contexts/WatchlistContext'
import ConfirmDialog from '../Common/ConfirmDialog'
import toast from 'react-hot-toast'

function fmt(n, dec = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function ScriptCard({ script, annStats = {}, rate = null, onOpenDrawer, onSetAlert, bulkMode, isSelected, onSelect }) {
  const navigate = useNavigate()
  const { removeScript } = useWatchlist()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removing, setRemoving]       = useState(false)
  const [flashClass, setFlashClass]   = useState('')
  const prevLtpRef = useRef(rate?.ltp)

  useEffect(() => {
    if (rate?.ltp && prevLtpRef.current && rate.ltp !== prevLtpRef.current) {
      if (rate.ltp > prevLtpRef.current) setFlashClass('animate-flash-green')
      else if (rate.ltp < prevLtpRef.current) setFlashClass('animate-flash-red')
      
      const timer = setTimeout(() => setFlashClass(''), 1000)
      prevLtpRef.current = rate.ltp
      return () => clearTimeout(timer)
    }
    prevLtpRef.current = rate?.ltp
  }, [rate?.ltp])

  const code   = script.ltdCode || script.bseCode || ''
  const symbol = script.symbol  || ''
  const count       = annStats.count      || 0
  const lastDate    = annStats.lastDate   || null
  const lastSubject = annStats.lastSubject || null

  const isUp   = rate?.pctChange != null && rate.pctChange >= 0
  const isDown = rate?.pctChange != null && rate.pctChange < 0

  async function handleRemove() {
    setRemoving(true)
    try {
      await removeScript(script.id)
      toast.success(`${script.scriptName} removed`)
    } catch {
      toast.error('Failed to remove script')
    } finally {
      setRemoving(false)
      setConfirmOpen(false)
    }
  }

  function handleCardClick(e) {
    if (bulkMode) { onSelect(script.id); return }
    if (e.target.closest('button') || e.target.closest('a')) return
    onOpenDrawer(script)
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className={clsx(
          'relative flex flex-col bg-surface border rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group animate-fade-in-up',
          flashClass,
          isSelected
            ? 'border-primary ring-2 ring-primary/30'
            : 'border-border hover:border-primary/50 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1'
        )}
      >
        {/* Checkbox */}
        <div
          className={clsx(
            'absolute top-3 left-3 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer',
            bulkMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
            isSelected ? 'bg-primary border-primary' : 'border-border bg-background/80'
          )}
          onClick={(e) => { e.stopPropagation(); onSelect(script.id) }}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Top accent bar — green/red based on price direction */}
        <div className={clsx(
          'h-1 w-full',
          rate?.ltp != null
            ? isUp   ? 'bg-emerald-500'
            : isDown ? 'bg-red-500'
            :          'bg-border'
            :          'bg-border'
        )} />

        {/* Card body */}
        <div className="flex flex-col flex-1 p-4 gap-3">

          {/* Row 1 — name + exchange badge */}
          <div className="flex items-start justify-between gap-2 pl-5">
            <div className="flex-1 min-w-0">
              <button
                onClick={e => { e.stopPropagation(); navigate('/company-data', { state: { script: { bseCode: code, scripName: script.scriptName, symbol } } }) }}
                className="font-semibold text-textPrimary text-sm leading-snug line-clamp-2 pr-1 hover:text-primary transition text-left"
                title="View company data"
              >{script.scriptName}</button>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {code   && <code className="text-[11px] font-mono text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">{code}</code>}
                {symbol && <code className="text-[11px] font-mono text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">{symbol}</code>}
              </div>
            </div>
            <span className={clsx('shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap', getExchangeColor(script.exchange))}>
              {script.exchange || 'BSE'}
            </span>
          </div>

          {/* Row 2 — LTP + change */}
          {rate?.ltp != null ? (
            <div className="bg-background/60 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-[10px] text-textMuted uppercase tracking-wider mb-0.5">LTP</p>
                  <p className="text-xl font-bold text-textPrimary tabular-nums">₹{fmt(rate.ltp)}</p>
                </div>
                {rate.pctChange != null && (
                  <div className={clsx(
                    'flex flex-col items-end',
                    isUp ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
                      {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {isUp ? '+' : ''}{fmt(rate.pctChange)}%
                    </span>
                    <span className="text-xs tabular-nums opacity-80">
                      {rate.change >= 0 ? '+' : ''}{fmt(rate.change)}
                    </span>
                  </div>
                )}
              </div>

              {/* OHLC mini row */}
              {(rate.open != null || rate.high != null || rate.low != null) && (
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50 text-[11px] text-textMuted tabular-nums flex-wrap">
                  {rate.open  != null && <span><span className="opacity-60">O</span> {fmt(rate.open)}</span>}
                  {rate.high  != null && <span className="text-emerald-400/80"><span className="opacity-70">H</span> {fmt(rate.high)}</span>}
                  {rate.low   != null && <span className="text-red-400/80"><span className="opacity-70">L</span> {fmt(rate.low)}</span>}
                  {rate.prevClose != null && <span><span className="opacity-60">PC</span> {fmt(rate.prevClose)}</span>}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-background/40 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-textMuted/40 animate-spin" style={{ animationDuration: '3s' }} />
              <span className="text-xs text-textMuted/50">Rate not available</span>
            </div>
          )}

          {/* Row 3 — announcements */}
          <div className="flex-1">
            {count > 0 ? (
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-400/10 text-amber-400 border border-amber-400/20 rounded-lg text-xs font-semibold">
                  <Bell className="w-3 h-3" />
                  {count} announcement{count !== 1 ? 's' : ''}
                </span>
                {lastDate && (
                  <p className="text-xs text-textMuted mt-1.5 line-clamp-1" title={lastSubject || ''}>
                    {formatRelativeDate(lastDate)}
                    {lastSubject && <span className="text-textMuted/60"> · {lastSubject.slice(0, 45)}{lastSubject.length > 45 ? '…' : ''}</span>}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-xs text-textMuted/40">No announcements yet</span>
            )}
          </div>

          {/* Alert active indicator */}
          {script.alertEnabled && (script.alertAbove != null || script.alertBelow != null) && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-400/10 border border-amber-400/20 rounded-lg">
              <BellRing className="w-3 h-3 text-amber-400" />
              <span className="text-[11px] text-amber-400 font-medium">
                {script.alertAbove != null && `▲ ₹${script.alertAbove}`}
                {script.alertAbove != null && script.alertBelow != null && ' · '}
                {script.alertBelow != null && `▼ ₹${script.alertBelow}`}
              </span>
            </div>
          )}

          {/* Row 4 — actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/announcements?script=${code}`) }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-lg transition"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Announcements
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSetAlert?.(script) }}
              className="w-8 h-8 flex items-center justify-center text-textMuted hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition"
              title="Set price alert"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
              className="w-8 h-8 flex items-center justify-center text-textMuted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Remove Script"
        message={`Remove "${script.scriptName}" from your watchlist?`}
        confirmLabel={removing ? 'Removing...' : 'Remove'}
        onConfirm={handleRemove}
        onCancel={() => setConfirmOpen(false)}
        danger
      />
    </>
  )
}

// Only re-render when the data this card actually displays has changed.
// With 5000 cards and rates updating every 2s, this prevents 4999 unnecessary re-renders per poll.
export default memo(ScriptCard, (prev, next) => {
  return (
    prev.script.id           === next.script.id           &&
    prev.script.scriptName   === next.script.scriptName   &&
    prev.script.alertAbove   === next.script.alertAbove   &&
    prev.script.alertBelow   === next.script.alertBelow   &&
    prev.script.alertEnabled === next.script.alertEnabled &&
    prev.annStats.count      === next.annStats.count      &&
    prev.annStats.lastDate   === next.annStats.lastDate   &&
    prev.rate?.ltp           === next.rate?.ltp           &&
    prev.rate?.pctChange     === next.rate?.pctChange     &&
    prev.bulkMode            === next.bulkMode            &&
    prev.isSelected          === next.isSelected
  )
})
