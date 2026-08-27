import { useMemo } from 'react';
import { Rocket, ArrowRight, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

export default function IpoActivityWidget({ data, loading, error }) {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="h-4 w-32 skeleton rounded" />
        <div className="h-10 w-16 skeleton rounded" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-8 skeleton rounded-xl" />)}
        </div>
      </div>
    );
  }

  const hasError = error || !data;

  // Guarantee ALL CT first, then ALL OPEN, sorted by estGain descending
  const { ctList, openList } = useMemo(() => {
    if (!data?.symbols || !Array.isArray(data.symbols)) {
      return { ctList: [], openList: [] };
    }

    const ct = [];
    const open = [];

    data.symbols.forEach(s => {
      const name = typeof s === 'string' ? s : s.name;
      const gmp = typeof s === 'string' ? null : s.gmp;
      const estGain = typeof s === 'string' ? 0 : (s.estGain || 0);
      const status = (typeof s === 'string' ? 'OPEN' : (s.status || 'OPEN')).toUpperCase();

      const item = { name, gmp, estGain, status, isCT: status === 'CT' };
      if (item.isCT) {
        ct.push(item);
      } else {
        open.push(item);
      }
    });

    ct.sort((a, b) => b.estGain - a.estGain);
    open.sort((a, b) => b.estGain - a.estGain);

    return { ctList: ct, openList: open };
  }, [data?.symbols]);

  const totalActive = (data?.activeCount) || (ctList.length + openList.length);

  return (
    <div className="glass-panel rounded-2xl p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">IPO Activity</h2>
        </div>
        <Link to="/ipo-gmp" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition">
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
          {/* Summary Badges */}
          <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-border/50">
            <div>
              <p className="text-3xl font-bold font-display text-primary tabular-nums">{totalActive}</p>
              <p className="text-[11px] text-textMuted font-medium uppercase tracking-wider mt-0.5">Active IPOs</p>
            </div>
            <div className="flex items-center gap-2">
              {ctList.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                  <Clock className="w-3 h-3" /> {ctList.length} Closing Today
                </span>
              )}
              {openList.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" /> {openList.length} Open
                </span>
              )}
            </div>
          </div>

          {/* Symbol list: All CT FIRST, followed by All OPEN */}
          {(ctList.length > 0 || openList.length > 0) ? (
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[320px] pr-1 scrollbar-hide">
              {/* CT Section */}
              {ctList.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 uppercase tracking-wider px-1">
                    <Clock className="w-3 h-3" /> Closing Today ({ctList.length})
                  </div>
                  {ctList.map(item => (
                    <Link
                      key={item.name}
                      to="/ipo-gmp"
                      className="flex items-center justify-between px-3 py-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition group shadow-sm"
                    >
                      <span className="text-xs font-semibold text-textPrimary group-hover:text-red-400 transition truncate mr-2">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.gmp !== null && (
                          <span className={clsx("text-[11px] font-bold", item.estGain >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {item.estGain >= 0 ? '+' : ''}{item.estGain.toFixed(1)}%
                          </span>
                        )}
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 uppercase">
                          CT
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* OPEN Section */}
              {openList.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider px-1">
                    <CheckCircle2 className="w-3 h-3" /> Open For Bidding ({openList.length})
                  </div>
                  {openList.map(item => (
                    <Link
                      key={item.name}
                      to="/ipo-gmp"
                      className="flex items-center justify-between px-3 py-2 bg-primary/5 hover:bg-primary/10 border border-primary/15 rounded-xl transition group shadow-sm"
                    >
                      <span className="text-xs font-semibold text-textPrimary group-hover:text-primary transition truncate mr-2">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.gmp !== null && (
                          <span className={clsx("text-[11px] font-bold", item.estGain >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {item.estGain >= 0 ? '+' : ''}{item.estGain.toFixed(1)}%
                          </span>
                        )}
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 uppercase">
                          OPEN
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-textMuted text-center py-6">No active IPOs available</p>
          )}
        </>
      )}
    </div>
  );
}
