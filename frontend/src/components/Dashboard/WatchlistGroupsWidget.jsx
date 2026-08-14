import { Layers } from 'lucide-react'
import clsx from 'clsx'

const GROUP_COLORS = [
  'bg-primary/10 text-primary border-primary/20',
  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'bg-rose-500/10 text-rose-400 border-rose-500/20',
]

export default function WatchlistGroupsWidget({ data, loading }) {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="h-4 w-36 skeleton rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-16 skeleton rounded-xl" />)}
        </div>
      </div>
    )
  }

  const groups = data ?? []

  return (
    <div className="glass-panel rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">Watchlist Groups</h2>
        </div>
        <span className="text-xs text-textMuted">{groups.length} groups</span>
      </div>

      {groups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center gap-2">
          <Layers className="w-8 h-8 text-textMuted/20" />
          <p className="text-sm text-textMuted">No groups yet</p>
          <p className="text-xs text-textMuted/60">Assign groups when adding scripts to organize by sector</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 flex-1">
          {groups.map((g, i) => (
            <div
              key={g.group}
              className={clsx(
                'rounded-xl border p-4 transition-all hover:-translate-y-0.5',
                GROUP_COLORS[i % GROUP_COLORS.length]
              )}
            >
              <p className="text-xs font-bold uppercase tracking-wider truncate">{g.group}</p>
              <p className="text-2xl font-bold font-display tabular-nums mt-1">{g.scripts}</p>
              <p className="text-[10px] font-medium opacity-70 mt-0.5">
                {g.scripts === 1 ? 'script' : 'scripts'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
