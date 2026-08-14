import { BarChart2, ArrowRight, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

export default function TopWatchlistCompaniesWidget({ data, loading }) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-6 space-y-3">
        <div className="h-4 w-44 skeleton rounded mb-4" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <div className="h-5 w-5 skeleton rounded" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-28 skeleton rounded" />
              <div className="h-3 w-20 skeleton rounded" />
            </div>
            <div className="h-4 w-8 skeleton rounded" />
          </div>
        ))}
      </div>
    )
  }

  const companies = data ?? []

  return (
    <div className="glass-panel rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">Top Watchlist Companies</h2>
        </div>
        <span className="text-xs text-textMuted">By Announcements</span>
      </div>

      {companies.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-center">
          <div>
            <BarChart2 className="w-8 h-8 text-textMuted/20 mx-auto mb-2" />
            <p className="text-sm text-textMuted">No watchlist announcements yet</p>
            <p className="text-xs text-textMuted/60 mt-1">Fetch news from the Watchlist page first</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1 flex-1">
          {companies.map((c, i) => (
            <button
              key={c.name}
              onClick={() => c.bseCode && navigate('/company-data', {
                state: { script: { bseCode: c.bseCode, scripName: c.name, symbol: c.symbol } }
              })}
              disabled={!c.bseCode}
              className="w-full flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-primary/5 transition group"
              aria-label={`View company data for ${c.name}`}
            >
              <span className="text-xs font-bold text-textMuted/40 w-5 text-center flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-textPrimary truncate group-hover:text-primary transition">
                  {c.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {c.bse > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/15 text-blue-400 rounded font-semibold">
                      {c.bse} BSE
                    </span>
                  )}
                  {c.nse > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/15 text-orange-400 rounded font-semibold">
                      {c.nse} NSE
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sm font-bold text-amber-400 flex-shrink-0">{c.total}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
