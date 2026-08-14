import { TrendingUp, TrendingDown, BarChart2 } from 'lucide-react'
import clsx from 'clsx'

function IndexCard({ index, primary = false }) {
  const isUp = index.changePercent >= 0

  return (
    <div className={clsx(
      'glass-panel rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg',
      primary && 'border-primary/20'
    )}>
      <p className="text-xs font-semibold text-textMuted uppercase tracking-wider truncate mb-3" title={index.name}>
        {index.name}
      </p>
      <p className="text-xl font-bold font-display text-textPrimary tabular-nums">
        {index.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </p>
      <div className={clsx(
        'flex items-center gap-1 mt-2 text-sm font-semibold',
        isUp ? 'text-emerald-400' : 'text-danger'
      )}>
        {isUp ? <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className="tabular-nums">
          {isUp ? '+' : ''}{index.change.toFixed(2)}
        </span>
        <span className="text-xs font-medium opacity-80">
          ({isUp ? '+' : ''}{index.changePercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  )
}

function IndexSkeleton() {
  return (
    <div className="glass-panel rounded-2xl p-5 space-y-3">
      <div className="h-3 w-24 skeleton rounded" />
      <div className="h-6 w-32 skeleton rounded" />
      <div className="h-4 w-20 skeleton rounded" />
    </div>
  )
}

// Priority order for display
const PRIORITY_NAMES = ['SENSEX', 'S&P BSE SENSEX', 'NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY MIDCAP']

export default function PrimaryIndicesWidget({ data, loading, error }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <IndexSkeleton key={i} />)}
      </div>
    )
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-5 text-center text-textMuted text-sm">
        <BarChart2 className="w-6 h-6 mx-auto mb-2 opacity-30" />
        Unable to load market indices
      </div>
    )
  }

  // Show first 4 (already priority-sorted by backend)
  const primary    = data.slice(0, 2)
  const secondary  = data.slice(2, 4)
  const allVisible = [...primary, ...secondary]

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {allVisible.map((idx, i) => (
        <IndexCard key={idx.name || i} index={idx} primary={i < 2} />
      ))}
    </div>
  )
}
