import { useState } from 'react'
import { TrendingUp, TrendingDown, ArrowRight, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { SkeletonRow } from '../Common/Loader'

function MoverRow({ item, type }) {
  const isGainer = type === 'gainer'
  const pct = item.changePercent

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-textPrimary truncate group-hover:text-primary transition">
          {item.name || item.bseCode || '—'}
        </p>
        <p className="text-xs text-textMuted tabular-nums mt-0.5">
          ₹{item.ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) ?? '—'}
        </p>
      </div>
      <div className={clsx(
        'flex items-center gap-1 text-sm font-bold tabular-nums ml-3 flex-shrink-0',
        isGainer ? 'text-emerald-400' : 'text-danger'
      )}>
        {isGainer ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        {pct != null ? `${isGainer ? '+' : ''}${pct.toFixed(2)}%` : '—'}
      </div>
    </div>
  )
}

function MoverList({ items, type, loading, error }) {
  if (loading) {
    return (
      <div className="divide-y divide-transparent">
        {[1,2,3,4,5].map(i => (
          <SkeletonRow key={i} />
        ))}
      </div>
    )
  }

  if (error || !items || items.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-textMuted">
        <AlertCircle className="w-5 h-5 mx-auto mb-2 opacity-40" />
        {error ? 'Unable to load data' : `No ${type === 'gainer' ? 'gainers' : 'losers'} data`}
      </div>
    )
  }

  return (
    <div className="divide-y divide-transparent">
      {items.map((item, i) => (
        <MoverRow key={item.bseCode || i} item={item} type={type} />
      ))}
    </div>
  )
}

export default function MarketMoversWidget({ data, loading, error }) {
  const [activeTab, setActiveTab] = useState('gainers')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const gainers = data?.gainers ?? []
  const losers  = data?.losers  ?? []
  const hasError = error || (!loading && !data)

  return (
    <div className="glass-panel rounded-2xl p-6 h-full">
      {/* Desktop: side by side */}
      <div className="hidden md:grid md:grid-cols-2 gap-6">
        {/* Gainers */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-textPrimary">Top Gainers</h2>
            </div>
            <Link to="/gainers-losers" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <MoverList items={gainers} type="gainer" loading={loading} error={hasError ? 'error' : null} />
        </div>

        {/* Divider */}
        <div className="border-l border-border pl-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-danger" />
              <h2 className="text-sm font-semibold text-textPrimary">Top Losers</h2>
            </div>
            <Link to="/gainers-losers" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <MoverList items={losers} type="loser" loading={loading} error={hasError ? 'error' : null} />
        </div>
      </div>

      {/* Mobile: tabs */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex bg-background border border-border rounded-xl p-1 flex-1">
            <button
              onClick={() => setActiveTab('gainers')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all',
                activeTab === 'gainers' ? 'bg-emerald-500/20 text-emerald-400' : 'text-textMuted'
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Gainers
            </button>
            <button
              onClick={() => setActiveTab('losers')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all',
                activeTab === 'losers' ? 'bg-danger/20 text-danger' : 'text-textMuted'
              )}
            >
              <TrendingDown className="w-3.5 h-3.5" /> Losers
            </button>
          </div>
          <Link to="/gainers-losers" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition whitespace-nowrap">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {activeTab === 'gainers' ? (
          <MoverList items={gainers} type="gainer" loading={loading} error={hasError ? 'error' : null} />
        ) : (
          <MoverList items={losers} type="loser" loading={loading} error={hasError ? 'error' : null} />
        )}
      </div>
    </div>
  )
}
