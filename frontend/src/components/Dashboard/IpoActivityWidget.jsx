import { Rocket, ArrowRight, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function IpoActivityWidget({ data, loading, error }) {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="h-4 w-32 skeleton rounded" />
        <div className="h-10 w-16 skeleton rounded" />
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-8 skeleton rounded-xl" />)}
        </div>
      </div>
    )
  }

  const hasError = error || !data

  return (
    <div className="glass-panel rounded-2xl p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">IPO Activity</h2>
        </div>
        <Link to="/ipo-gmp" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition">
          IPO Center <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {hasError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <AlertCircle className="w-6 h-6 text-textMuted/40 mb-2" />
          <p className="text-sm text-textMuted">IPO information unavailable</p>
        </div>
      ) : (
        <>
          {/* Big count */}
          <div className="mb-5">
            <p className="text-4xl font-bold font-display text-primary tabular-nums">{data.activeCount}</p>
            <p className="text-xs text-textMuted font-semibold uppercase tracking-wider mt-1">Active IPOs</p>
          </div>

          {/* Symbol list */}
          {data.symbols.length > 0 ? (
            <div className="space-y-2 flex-1">
              {data.symbols.map(symbol => {
                const name = typeof symbol === 'string' ? symbol : symbol.name;
                const gmp = typeof symbol === 'string' ? null : symbol.gmp;
                const estGain = typeof symbol === 'string' ? 0 : symbol.estGain;
                const status = typeof symbol === 'string' ? 'OPEN' : (symbol.status || 'OPEN');
                const isCT = status === 'CT';

                return (
                  <Link
                    key={name}
                    to="/ipo-gmp"
                    className="flex items-center justify-between px-3 py-2.5 bg-primary/5 border border-primary/15 rounded-xl hover:bg-primary/10 transition group"
                  >
                    <span className="text-sm font-semibold text-textPrimary group-hover:text-primary transition truncate mr-2">
                      {name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {gmp !== null && (
                        <span className={`text-[11px] font-semibold ${estGain > 0 ? 'text-emerald-400' : estGain < 0 ? 'text-red-400' : 'text-textMuted'}`}>
                          {estGain > 0 ? '+' : ''}{estGain.toFixed(1)}%
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isCT ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>
                        {status}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-textMuted text-center py-4">No active IPO symbols available</p>
          )}
        </>
      )}
    </div>
  )
}
