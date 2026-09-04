import { useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Bell, BarChart2 } from 'lucide-react'
import clsx from 'clsx'
import { getExchangeColor, formatRelativeDate } from '../../utils/formatters'
import { useWatchlist } from '../../contexts/WatchlistContext'
import ConfirmDialog from '../Common/ConfirmDialog'
import toast from 'react-hot-toast'

function ScriptCard({ script, annStats = {}, onOpenDrawer, bulkMode, isSelected, onSelect }) {
  const navigate = useNavigate()
  const { removeScript } = useWatchlist()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removing, setRemoving]       = useState(false)

  const code   = script.ltdCode || script.bseCode || ''
  const symbol = script.symbol  || ''
  const count       = annStats.count      || 0
  const lastDate    = annStats.lastDate   || null
  const lastSubject = annStats.lastSubject || null

  async function handleRemove() {
    setRemoving(true)
    try {
      await removeScript(script.id)
      toast.success(`${script.scriptName} removed`)
    } catch {
      toast.error('Failed to remove script')
      setRemoving(false)
    }
    setConfirmOpen(false)
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
          'relative flex flex-col overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 group animate-fade-in-up h-full',
          removing && 'opacity-40 scale-[0.98] pointer-events-none',
          isSelected
            ? 'glass-panel ring-2 ring-primary/50 bg-primary/5'
            : 'glass-panel glass-panel--interactive bg-gradient-to-br from-surface to-surface/30'
        )}
      >
        {/* Subtle top glow line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Checkbox */}
        <div
          className={clsx(
            'absolute top-4 left-4 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 cursor-pointer',
            bulkMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            isSelected ? 'bg-primary border-primary scale-110 shadow-lg shadow-primary/30' : 'border-border bg-background/80 hover:border-primary/50'
          )}
          onClick={(e) => { e.stopPropagation(); onSelect(script.id) }}
        >
          {isSelected && (
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Card body */}
        <div className="flex flex-col flex-1 p-5 gap-4 relative z-0">

          {/* Row 1 — name + exchange badge */}
          <div className="flex items-start justify-between gap-3 pl-6">
            <div className="flex-1 min-w-0">
              <button
                onClick={e => { e.stopPropagation(); navigate('/company-data', { state: { script: { bseCode: code, scripName: script.scriptName, symbol } } }) }}
                className="font-bold text-textPrimary text-sm sm:text-base leading-snug line-clamp-2 pr-1 group-hover:text-primary transition-colors duration-200 text-left"
                title="View company data"
              >
                {script.scriptName}
              </button>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {code   && <code className="text-[10px] sm:text-[11px] font-mono font-medium text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20">{code}</code>}
                {symbol && <code className="text-[10px] sm:text-[11px] font-mono font-medium text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded border border-orange-400/20">{symbol}</code>}
              </div>
            </div>
            <span className={clsx(
              'shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap mt-0.5 uppercase tracking-wide border',
              getExchangeColor(script.exchange) === 'text-blue-400 bg-blue-400/15' ? 'bg-blue-400/10 text-blue-400 border-blue-400/20' :
              getExchangeColor(script.exchange) === 'text-orange-400 bg-orange-400/15' ? 'bg-orange-400/10 text-orange-400 border-orange-400/20' :
              'bg-primary/10 text-primary border-primary/20'
            )}>
              {script.exchange || 'BSE'}
            </span>
          </div>

          {/* Row 2 — announcements */}
          <div className="flex-1 mt-2">
            {count > 0 ? (
              <div className="flex flex-col items-start gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold shadow-[0_0_12px_rgba(245,185,66,0.15)]">
                  <Bell className="w-3.5 h-3.5 fill-amber-400/20" />
                  {count} Announcement{count !== 1 ? 's' : ''}
                </span>
                {lastDate && (
                  <p className="text-xs text-textMuted/80 line-clamp-2 leading-relaxed" title={lastSubject || ''}>
                    <span className="text-textPrimary/80 font-medium">{formatRelativeDate(lastDate)}</span>
                    {lastSubject && <span> — {lastSubject}</span>}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-2 opacity-60">
                <div className="w-1.5 h-1.5 rounded-full bg-textMuted/40" />
                <span className="text-xs text-textMuted font-medium">No announcements yet</span>
              </div>
            )}
          </div>

          {/* Row 3 — actions */}
          <div className="flex items-center gap-2.5 pt-3.5 border-t border-white/5 mt-auto">
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/announcements?script=${code}`) }}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-primary/10 hover:bg-primary text-primary hover:text-white text-xs font-bold rounded-xl transition-all duration-200 shadow-sm hover:shadow-primary/20 hover:-translate-y-0.5"
            >
              <BarChart2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Announcements</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
              aria-label={`Remove ${script.scriptName} from watchlist`}
              title="Remove from watchlist"
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-textMuted hover:text-red-400 bg-surface/40 hover:bg-red-500/10 rounded-xl transition-all duration-200 border border-transparent hover:border-red-500/20 shadow-sm hover:-translate-y-0.5"
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
export default memo(ScriptCard, (prev, next) => {
  return (
    prev.script.id           === next.script.id           &&
    prev.script.scriptName   === next.script.scriptName   &&
    prev.annStats.count      === next.annStats.count      &&
    prev.annStats.lastDate   === next.annStats.lastDate   &&
    prev.bulkMode            === next.bulkMode            &&
    prev.isSelected          === next.isSelected
  )
})