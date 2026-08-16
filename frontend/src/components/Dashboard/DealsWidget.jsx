import { Briefcase, ArrowRight, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

function DealRow({ item }) {
  const isBulk  = (item.dealType || '').toUpperCase().includes('BULK')
  const isBlock = (item.dealType || '').toUpperCase().includes('BLOCK')

  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-textPrimary truncate">{item.company || '—'}</p>
          {item.dealType && (
            <span className={clsx(
              'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0',
              isBlock ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'
            )}>
              {isBlock ? 'BLOCK' : 'BULK'}
            </span>
          )}
        </div>
        {item.client && (
          <p className="text-xs text-textMuted truncate mt-0.5">{item.client}</p>
        )}
      </div>
      {item.value > 0 && (
        <p className="text-xs font-bold text-textPrimary whitespace-nowrap flex-shrink-0 mt-0.5">
          ₹{(item.value / 10_000_000).toFixed(0)} Cr
        </p>
      )}
    </div>
  )
}

export default function DealsWidget({ data, loading, error }) {
  const items = data?.items ?? []

  return (
    <div className="glass-panel rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-textPrimary">Bulk &amp; Block Deals</h2>
        </div>
        <Link to="/bulk-block" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition">
          View All <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-0 flex-1">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex justify-between items-start py-2.5 border-b border-border/30 gap-3">
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-28 skeleton rounded" />
                <div className="h-3 w-20 skeleton rounded" />
              </div>
              <div className="h-4 w-14 skeleton rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="w-6 h-6 text-textMuted/30 mb-2" />
          <p className="text-sm text-textMuted">Unable to load deals</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-sm text-textMuted">No bulk or block deals today</p>
        </div>
      ) : (
        <div className="flex-1 space-y-0">
          {items.map((item, i) => (
            <DealRow key={`${item.bseCode || item.symbol || 'deal'}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
