import { Activity, ArrowRight, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SkeletonRow } from '../Common/Loader'

function SpurtRow({ item }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-textPrimary truncate">{item.name || item.bseCode || '—'}</p>
        {item.volume > 0 && (
          <p className="text-xs text-textMuted mt-0.5 tabular-nums">
            Vol: {item.volume.toLocaleString('en-IN')}
          </p>
        )}
      </div>
      {item.multiplier > 0 && (
        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
          {item.multiplier.toFixed(1)}× avg
        </span>
      )}
    </div>
  )
}

export default function VolumeSpurtWidget({ data, loading, error }) {
  const items = data?.items ?? []

  return (
    <div className="glass-panel rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-textPrimary">Volume Spurts</h2>
        </div>
        <Link to="/volume-spurt" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition">
          View All <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 divide-y divide-border/30">
          {[1,2,3,4,5].map(i => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="w-6 h-6 text-textMuted/30 mb-2" />
          <p className="text-sm text-textMuted">Unable to load volume spurts</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-sm text-textMuted">No volume spurts detected today</p>
        </div>
      ) : (
        <div className="flex-1 space-y-0">
          {items.map((item, i) => <SpurtRow key={item.bseCode || i} item={item} />)}
        </div>
      )}
    </div>
  )
}
