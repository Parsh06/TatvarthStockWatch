import { useState } from 'react'
import {
  Sparkles, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus,
  CheckCircle2, XCircle, AlertTriangle, Info,
  Target, Lightbulb, BarChart3, Building2
} from 'lucide-react'
import clsx from 'clsx'

// ── Reusable metric card ─────────────────────────────────────────────────────
function Metric({ label, value, qoq, yoy }) {
  const parseNum = (v) => {
    if (!v || v === 'Not Reported' || v === 'Not Applicable') return null
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }
  const qoqNum = parseNum(qoq)
  const yoyNum = parseNum(yoy)

  const pill = (num, label) => {
    if (num === null) return null
    const pos = num > 0
    const neg = num < 0
    return (
      <span className={clsx(
        'inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border',
        pos && 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
        neg && 'text-red-400 bg-red-400/10 border-red-400/20',
        !pos && !neg && 'text-textMuted bg-surface/50 border-border/50'
      )}>
        {label}
        {pos ? <TrendingUp className="w-2.5 h-2.5" /> : neg ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
        {Math.abs(num)}%
      </span>
    )
  }

  const display = (!value || value === 'Not Reported' || value === 'Not Applicable') ? '—' : value

  return (
    <div className="flex flex-col p-3 bg-surface border border-border/50 rounded-xl">
      <span className="text-[10px] text-textMuted mb-1 font-semibold uppercase tracking-wider">{label}</span>
      <span className="text-base font-bold text-textPrimary mb-2">{display}</span>
      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
        {pill(qoqNum, 'QoQ ')}
        {pill(yoyNum, 'YoY ')}
      </div>
    </div>
  )
}

// ── Bullet list ──────────────────────────────────────────────────────────────
function BulletList({ items, color = 'text-primary' }) {
  const filtered = (Array.isArray(items) ? items : [])
    .filter(i => i && i !== 'Not Reported' && i !== 'Not Applicable')
  if (!filtered.length) return null
  return (
    <ul className="space-y-1.5">
      {filtered.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-textPrimary leading-relaxed">
          <span className={clsx('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', color.replace('text-', 'bg-'))} />
          <span>{String(item).replace(/^[\d.\-•]+\s*/, '')}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Sentiment badge ──────────────────────────────────────────────────────────
function SentimentBadge({ value }) {
  if (!value || value === 'Not Reported' || value === 'Not Applicable') return null
  const lc = value.toLowerCase()
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide border',
      lc === 'positive' && 'bg-emerald-400/10 text-emerald-400 border-emerald-400/25',
      lc === 'negative' && 'bg-red-400/10 text-red-400 border-red-400/25',
      lc === 'neutral'  && 'bg-surface text-textMuted border-border',
    )}>
      {lc === 'positive' ? <TrendingUp className="w-3 h-3" /> : lc === 'negative' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {value}
    </span>
  )
}

// ── Importance badge ─────────────────────────────────────────────────────────
function ImportanceBadge({ value }) {
  if (!value || value === 'Not Reported' || value === 'Not Applicable') return null
  const lc = value.toLowerCase()
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide border',
      lc === 'high'   && 'bg-amber-400/10 text-amber-400 border-amber-400/25',
      lc === 'medium' && 'bg-blue-400/10 text-blue-400 border-blue-400/25',
      lc === 'low'    && 'bg-surface text-textMuted border-border',
    )}>
      {value} Importance
    </span>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children, iconColor = 'text-primary' }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={clsx('p-1 rounded-md', iconColor.replace('text-', 'bg-') + '/10')}>
          <Icon className={clsx('w-3.5 h-3.5', iconColor)} />
        </div>
        <h5 className="text-xs font-bold text-textMuted uppercase tracking-wider">{title}</h5>
      </div>
      {children}
    </div>
  )
}

// ── Corporate action row ─────────────────────────────────────────────────────
function CorporateActionRow({ label, value }) {
  if (!value || value === 'Not Reported' || value === 'Not Applicable') return null
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-textMuted w-32 flex-shrink-0 font-medium">{label}:</span>
      <span className="text-textPrimary">{value}</span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
/**
 * AiAnalysisPanel
 *
 * Renders the full institutional-grade AI analysis for an announcement.
 * The `analysis` prop is the JSON object returned by the Gemini model.
 *
 * Props:
 *   analysis     — the analysis object (from aiAnalysis.analysis in MongoDB)
 *   generatedAt  — ISO date string of when it was generated
 *   cached       — boolean, was it served from cache?
 */
export default function AiAnalysisPanel({ analysis, generatedAt, cached }) {
  const [expanded, setExpanded] = useState(true)

  if (!analysis || typeof analysis !== 'object') return null

  const a = analysis
  const hasFinancials = a.financials?.applicable !== false &&
    (a.financials?.revenue?.current || a.financials?.netProfit?.current)

  const generatedLabel = (() => {
    if (!generatedAt) return null
    try {
      const d = new Date(generatedAt)
      const diff = Math.floor((Date.now() - d.getTime()) / 1000)
      if (diff < 120) return 'Just now'
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    } catch { return null }
  })()

  const corporateActionsExist = a.corporateActions && Object.values(a.corporateActions)
    .some(v => v && v !== 'Not Reported' && v !== 'Not Applicable')

  return (
    <div className="mt-3 border border-primary/20 bg-gradient-to-br from-primary/5 to-violet-900/5 rounded-2xl overflow-hidden">
      {/* ── Header / toggle ── */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="w-full flex items-center justify-between p-3.5 hover:bg-primary/8 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-lg border border-violet-500/20">
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-primary">Tatvarth AI Analysis</h4>
              {cached && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  CACHED
                </span>
              )}
            </div>
            {a.headline && (
              <p className="text-xs text-textPrimary mt-0.5 line-clamp-1 opacity-80">{a.headline}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {generatedLabel && (
            <span className="text-[10px] text-textMuted opacity-60">{generatedLabel}</span>
          )}
          <div className="text-primary/50">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* ── Body ── */}
      {expanded && (
        <div className="px-4 pb-5 space-y-5 border-t border-primary/10" onClick={(e) => e.stopPropagation()}>
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap pt-4">
            <SentimentBadge value={a.sentiment} />
            <ImportanceBadge value={a.importance} />
            {a.announcementCategory && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-surface border border-border text-textMuted font-medium">
                {a.announcementCategory}
              </span>
            )}
          </div>

          {/* Summary bullets */}
          {Array.isArray(a.summary) && a.summary.some(s => s && s !== 'Not Reported') && (
            <Section icon={Info} title="Executive Summary" iconColor="text-blue-400">
              <BulletList items={a.summary} color="text-blue-400" />
            </Section>
          )}

          {/* Financial Highlights */}
          {hasFinancials && (
            <Section icon={BarChart3} title="Financial Highlights" iconColor="text-emerald-400">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {a.financials.revenue?.current && (
                  <Metric label="Revenue" value={a.financials.revenue.current}
                    qoq={a.financials.revenue.qoqPercent} yoy={a.financials.revenue.yoyPercent} />
                )}
                {a.financials.ebitda?.current && (
                  <Metric label="EBITDA" value={a.financials.ebitda.current}
                    qoq={a.financials.ebitda.qoqPercent} yoy={a.financials.ebitda.yoyPercent} />
                )}
                {a.financials.netProfit?.current && (
                  <Metric label="Net Profit (PAT)" value={a.financials.netProfit.current}
                    qoq={a.financials.netProfit.qoqPercent} yoy={a.financials.netProfit.yoyPercent} />
                )}
              </div>
              {/* Margin row */}
              {a.financials.marginAnalysis && Object.values(a.financials.marginAnalysis).some(v => v && v !== 'Not Reported' && v !== 'Not Applicable') && (
                <div className="flex flex-wrap gap-3 mt-3">
                  {Object.entries(a.financials.marginAnalysis).map(([k, v]) =>
                    v && v !== 'Not Reported' && v !== 'Not Applicable' ? (
                      <div key={k} className="text-xs text-textMuted">
                        <span className="capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>{' '}
                        <span className="text-textPrimary font-semibold">{v}</span>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Key Highlights */}
          {Array.isArray(a.keyHighlights) && a.keyHighlights.some(h => h && h !== 'Not Reported' && h !== 'Not Applicable') && (
            <Section icon={Lightbulb} title="Key Highlights" iconColor="text-amber-400">
              <div className="flex flex-wrap gap-2">
                {a.keyHighlights
                  .filter(h => h && h !== 'Not Reported' && h !== 'Not Applicable')
                  .map((h, i) => (
                    <span key={i} className="text-[11px] px-2.5 py-1 bg-surface border border-border rounded-lg text-textPrimary leading-snug">
                      {h}
                    </span>
                  ))}
              </div>
            </Section>
          )}

          {/* Corporate Actions */}
          {corporateActionsExist && (
            <Section icon={Building2} title="Corporate Actions" iconColor="text-violet-400">
              <div className="space-y-1.5">
                <CorporateActionRow label="Dividend" value={a.corporateActions?.dividend} />
                <CorporateActionRow label="Stock Split" value={a.corporateActions?.stockSplit} />
                <CorporateActionRow label="Bonus Issue" value={a.corporateActions?.bonusIssue} />
                <CorporateActionRow label="Buyback" value={a.corporateActions?.buyback} />
                <CorporateActionRow label="Rights Issue" value={a.corporateActions?.rightsIssue} />
                <CorporateActionRow label="Merger" value={a.corporateActions?.merger} />
                <CorporateActionRow label="Acquisition" value={a.corporateActions?.acquisition} />
                <CorporateActionRow label="Fund Raise" value={a.corporateActions?.fundRaise} />
                <CorporateActionRow label="Board Changes" value={a.corporateActions?.boardChanges} />
                <CorporateActionRow label="Mgmt Changes" value={a.corporateActions?.managementChanges} />
                <CorporateActionRow label="Credit Rating" value={a.corporateActions?.creditRatingChange} />
                <CorporateActionRow label="Regulatory" value={a.corporateActions?.litigationOrRegulatory} />
              </div>
            </Section>
          )}

          {/* Category-specific details — conditionally shown */}
          {a.categorySpecificDetails && (() => {
            const csd = a.categorySpecificDetails
            const hasData = Object.values(csd).some(v => v && v !== 'Not Reported' && v !== 'Not Applicable')
            if (!hasData) return null
            return (
              <Section icon={Target} title="Filing Details" iconColor="text-cyan-400">
                <div className="space-y-1.5">
                  <CorporateActionRow label="Resolutions" value={csd.meetingResolutions} />
                  <CorporateActionRow label="Voting" value={csd.votingResults} />
                  <CorporateActionRow label="Notice" value={csd.noticeDetails} />
                  <CorporateActionRow label="Compliance" value={csd.complianceStatus} />
                  <CorporateActionRow label="Highlights" value={csd.pressReleaseHighlights} />
                </div>
              </Section>
            )
          })()}

          {/* Footer note */}
          <p className="text-[10px] text-textMuted opacity-50 pt-1 border-t border-border/40">
            Tatvarth AI · Powered by Gemini · For informational purposes only. Not financial advice.
          </p>
        </div>
      )}
    </div>
  )
}
