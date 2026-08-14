import { useMemo } from 'react'
import { format } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'

function getGreeting() {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Good Morning'
  if (h >= 12 && h < 17) return 'Good Afternoon'
  if (h >= 17 && h < 24) return 'Good Evening'
  return 'Good Night'
}

function MarketStatusBadge() {
  const now = new Date()
  const h   = now.getHours()
  const m   = now.getMinutes()
  const day = now.getDay() // 0=Sun, 6=Sat
  const hm  = h * 60 + m

  // IST market hours: 9:15 to 15:30
  const PRE_OPEN_START  = 9 * 60 + 0
  const MARKET_OPEN     = 9 * 60 + 15
  const MARKET_CLOSE    = 15 * 60 + 30
  const POST_CLOSE      = 16 * 60 + 0

  const isWeekend = day === 0 || day === 6

  let status, label, dotColor
  if (isWeekend) {
    status   = 'CLOSED'
    label    = 'Market Closed'
    dotColor = 'bg-red-500'
  } else if (hm < PRE_OPEN_START) {
    status   = 'CLOSED'
    label    = 'Pre-open Soon'
    dotColor = 'bg-amber-500'
  } else if (hm < MARKET_OPEN) {
    status   = 'PRE_OPEN'
    label    = 'Pre-Open'
    dotColor = 'bg-amber-400'
  } else if (hm <= MARKET_CLOSE) {
    status   = 'OPEN'
    label    = 'Market Open'
    dotColor = 'bg-emerald-500'
  } else if (hm < POST_CLOSE) {
    status   = 'POST_MARKET'
    label    = 'Post-Market'
    dotColor = 'bg-amber-500'
  } else {
    status   = 'CLOSED'
    label    = 'Market Closed'
    dotColor = 'bg-red-500'
  }

  return (
    <span className={clsx(
      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border',
      status === 'OPEN'
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : status === 'PRE_OPEN' || status === 'POST_MARKET'
        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        : 'bg-red-500/10 border-red-500/30 text-red-400'
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', dotColor, status === 'OPEN' && 'animate-pulse')} />
      {label}
    </span>
  )
}

export default function DashboardHeader({ onRefresh, refreshing, lastUpdated }) {
  const { currentUser } = useAuth()
  const greeting  = useMemo(() => getGreeting(), [])
  const firstName = currentUser?.displayName?.split(' ')[0] || ''
  const today     = format(new Date(), 'EEEE, d MMMM yyyy')

  const updatedLabel = useMemo(() => {
    if (!lastUpdated) return null
    return `Updated ${format(lastUpdated, 'h:mm a')}`
  }, [lastUpdated])

  return (
    <div className="glass-panel rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      {/* Left: Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-textPrimary tracking-tight">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-sm text-textMuted mt-0.5">{today}</p>
        <p className="text-xs text-textMuted/60 mt-0.5">Indian Market Overview</p>
      </div>

      {/* Right: Status + Refresh */}
      <div className="flex items-center gap-3 flex-wrap">
        <MarketStatusBadge />

        {updatedLabel && (
          <span className="text-xs text-textMuted hidden sm:block">{updatedLabel}</span>
        )}

        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh dashboard data"
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
