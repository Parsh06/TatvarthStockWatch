import { Star, ArrowRight, Bell, BarChart2, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'

function StatRow({ icon: Icon, label, value, color = 'text-textPrimary' }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2.5">
        <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
        <span className="text-sm text-textMuted">{label}</span>
      </div>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

export default function WatchlistSummaryWidget({ data, loading, error }) {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="h-4 w-36 skeleton rounded" />
        <div className="h-12 w-20 skeleton rounded" />
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-8 skeleton rounded" />)}
        </div>
      </div>
    )
  }

  const hasError = error || !data

  if (hasError || data?.scriptCount === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">Your Watchlist</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 gap-3">
          <Star className="w-8 h-8 text-textMuted/20" />
          <p className="text-sm text-textMuted">No scripts added yet</p>
          <p className="text-xs text-textMuted/60">Add stocks from Watchlist to see personalized market activity here.</p>
          <Link
            to="/watchlist"
            className="mt-2 text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition"
          >
            Go to Watchlist <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">Your Watchlist</h2>
        </div>
        <Link to="/watchlist" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition">
          Manage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Big script count */}
      <div className="mb-5">
        <p className="text-4xl font-bold font-display text-textPrimary tabular-nums">{data.scriptCount}</p>
        <p className="text-xs text-textMuted font-semibold uppercase tracking-wider mt-1">Watchlisted Scripts</p>
      </div>

      {/* Stats */}
      <div className="flex-1 space-y-0">
        <StatRow icon={Bell}     label="Announcements Today" value={data.announcementCount} color={data.announcementCount > 0 ? 'text-primary' : 'text-textMuted'} />
        <StatRow icon={BarChart2} label="Board Meetings"      value={data.boardMeetingCount} color={data.boardMeetingCount > 0 ? 'text-amber-400' : 'text-textMuted'} />
        <StatRow icon={Activity}  label="Volume Spurts"       value={data.volumeSpurtCount}  color={data.volumeSpurtCount > 0 ? 'text-emerald-400' : 'text-textMuted'} />
      </div>
    </div>
  )
}
