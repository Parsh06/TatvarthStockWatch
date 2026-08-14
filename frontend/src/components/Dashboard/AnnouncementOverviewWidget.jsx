import { Bell, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

function StatPill({ label, value, color }) {
  return (
    <div className="flex-1 text-center">
      <p className={clsx('text-3xl font-bold font-display tabular-nums', color)}>
        {value?.toLocaleString('en-IN') ?? '—'}
      </p>
      <p className="text-xs font-semibold text-textMuted uppercase tracking-wider mt-1">{label}</p>
    </div>
  )
}

export default function AnnouncementOverviewWidget({ data, loading, error }) {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-8 space-y-6">
        <div className="h-5 w-48 skeleton rounded mx-auto" />
        <div className="h-16 w-32 skeleton rounded mx-auto" />
        <div className="grid grid-cols-2 gap-8">
          <div className="h-12 skeleton rounded" />
          <div className="h-12 skeleton rounded" />
        </div>
        <div className="h-3 skeleton rounded" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <AlertCircle className="w-8 h-8 text-danger mx-auto mb-2" />
        <p className="text-textMuted font-medium">Announcement data unavailable</p>
        <p className="text-xs text-textMuted/60 mt-1">Please try refreshing the page</p>
      </div>
    )
  }

  const { total, bse, nse } = data
  const grand   = bse + nse
  const bsePct  = grand > 0 ? ((bse / grand) * 100).toFixed(1) : '0'
  const nsePct  = grand > 0 ? ((nse / grand) * 100).toFixed(1) : '0'

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 text-center border-b border-border">
        <p className="text-xs font-bold text-textMuted uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
          <Bell className="w-3.5 h-3.5" />
          Today's Market Announcements
        </p>
        <p className="text-6xl font-bold font-display text-textPrimary tabular-nums leading-none">
          {total.toLocaleString('en-IN')}
        </p>
        <p className="text-xs text-textMuted/60 mt-2 uppercase tracking-widest font-semibold">Total</p>
      </div>

      {/* BSE / NSE split */}
      <div className="px-8 py-6">
        <div className="flex items-center gap-6 mb-4">
          <StatPill label="BSE" value={bse} color="text-blue-400" />
          <div className="w-px h-12 bg-border" />
          <StatPill label="NSE" value={nse} color="text-orange-400" />
        </div>

        {/* Distribution bar */}
        {grand > 0 && (
          <div className="space-y-2">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-background">
              <div
                className="h-full bg-blue-500 transition-all duration-700"
                style={{ width: `${bsePct}%` }}
                title={`BSE ${bsePct}%`}
              />
              <div className="h-full bg-orange-500 flex-1 transition-all duration-700" title={`NSE ${nsePct}%`} />
            </div>
            <div className="flex justify-between text-xs text-textMuted font-medium">
              <span className="text-blue-400">BSE {bsePct}%</span>
              <span className="text-orange-400">NSE {nsePct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 pb-6 flex justify-end">
        <Link
          to="/all-announcements"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition"
        >
          View All Announcements <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}
