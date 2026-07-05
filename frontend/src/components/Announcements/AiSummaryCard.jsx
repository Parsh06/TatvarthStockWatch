import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';

function Metric({ label, value, qoq, yoy }) {
  const parsePercent = (val) => {
    if (!val || val === 'Not Reported' || val === 'Not Applicable') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  };

  const qoqNum = parsePercent(qoq);
  const yoyNum = parsePercent(yoy);

  const getColor = (num) => {
    if (num > 0) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (num < 0) return 'text-red-400 bg-red-400/10 border-red-400/20';
    return 'text-textMuted bg-surface/50 border-border/50';
  };

  const getIcon = (num) => {
    if (num > 0) return <TrendingUp className="w-3 h-3" />;
    if (num < 0) return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  return (
    <div className="flex flex-col p-3 bg-surface border border-border/50 rounded-xl">
      <span className="text-xs text-textMuted mb-1 font-medium uppercase tracking-wider">{label}</span>
      <span className="text-base font-semibold text-textPrimary mb-2">{value !== 'Not Reported' && value !== 'Not Applicable' ? value : '—'}</span>
      <div className="flex items-center gap-2 mt-auto">
        {qoqNum !== null && (
          <span className={clsx('flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border', getColor(qoqNum))}>
            QoQ {getIcon(qoqNum)} {Math.abs(qoqNum)}%
          </span>
        )}
        {yoyNum !== null && (
          <span className={clsx('flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border', getColor(yoyNum))}>
            YoY {getIcon(yoyNum)} {Math.abs(yoyNum)}%
          </span>
        )}
      </div>
    </div>
  );
}

export default function AiSummaryCard({ summary }) {
  const [expanded, setExpanded] = useState(false);

  if (!summary || typeof summary !== 'object') return null;

  const hasFinancials = summary.financials && 
    summary.financials.applicable !== false &&
    (summary.financials.revenue?.current !== 'Not Reported' && summary.financials.revenue?.current !== 'Not Applicable' || 
     summary.financials.netProfit?.current !== 'Not Reported' && summary.financials.netProfit?.current !== 'Not Applicable');

  return (
    <div className="mt-3 border border-primary/20 bg-primary/5 rounded-xl overflow-hidden transition-all">
      {/* Header */}
      <button 
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="w-full flex items-center justify-between p-3 hover:bg-primary/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/20 rounded-lg">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-semibold text-primary">Tatvarth AI Insight</h4>
            {summary.headline && <p className="text-xs text-textPrimary line-clamp-1">{summary.headline}</p>}
          </div>
        </div>
        <div className="text-primary/60 p-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 pt-0 border-t border-primary/10 mt-2" onClick={e => e.stopPropagation()}>
          
          {/* Summary Bullets */}
          {summary.summary && Array.isArray(summary.summary) && summary.summary.length > 0 && (
            <div className="mb-5 mt-3">
              <ul className="space-y-2">
                {summary.summary.map((point, i) => (
                  <li key={i} className="text-sm text-textPrimary flex items-start gap-2 leading-relaxed">
                    <span className="text-primary mt-1 text-xs">●</span>
                    <span>{point.replace(/^[\d. \-•]+/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Financials Grid */}
          {hasFinancials && (
            <div className="mb-5">
              <h5 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-3">Financial Highlights</h5>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Metric label="Revenue" value={summary.financials.revenue?.current} qoq={summary.financials.revenue?.qoqPercent} yoy={summary.financials.revenue?.yoyPercent} />
                <Metric label="EBITDA" value={summary.financials.ebitda?.current} qoq={summary.financials.ebitda?.qoqPercent} yoy={summary.financials.ebitda?.yoyPercent} />
                <Metric label="Net Profit (PAT)" value={summary.financials.netProfit?.current} qoq={summary.financials.netProfit?.qoqPercent} yoy={summary.financials.netProfit?.yoyPercent} />
              </div>
            </div>
          )}

          {/* Corporate Actions & Key Highlights */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Highlights */}
            {summary.keyHighlights && Array.isArray(summary.keyHighlights) && summary.keyHighlights.length > 0 && summary.keyHighlights[0] !== 'Not Reported' && summary.keyHighlights[0] !== 'Not Applicable' && (
              <div>
                <h5 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Key Highlights</h5>
                <div className="flex flex-wrap gap-2">
                  {summary.keyHighlights.filter(h => h && h !== 'Not Reported' && h !== 'Not Applicable').map((highlight, i) => (
                    <span key={i} className="text-[11px] px-2 py-1 bg-surface border border-border rounded-lg text-textPrimary">
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Details */}
            <div className="flex flex-col gap-2 justify-start">
              {summary.sentiment && summary.sentiment !== 'Not Reported' && summary.sentiment !== 'Not Applicable' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-textMuted w-20">Sentiment:</span>
                  <span className={clsx(
                    'text-[11px] font-bold px-2 py-0.5 rounded-md uppercase',
                    summary.sentiment.toLowerCase() === 'positive' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' :
                    summary.sentiment.toLowerCase() === 'negative' ? 'bg-red-400/10 text-red-400 border border-red-400/20' :
                    'bg-surface border border-border text-textMuted'
                  )}>
                    {summary.sentiment}
                  </span>
                </div>
              )}
              {summary.corporateActions?.dividend && summary.corporateActions.dividend !== 'Not Reported' && summary.corporateActions.dividend !== 'Not Applicable' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-textMuted w-20">Dividend:</span>
                  <span className="text-xs text-textPrimary font-medium">{summary.corporateActions.dividend}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
