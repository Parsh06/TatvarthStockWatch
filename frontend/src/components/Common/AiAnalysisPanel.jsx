import { useState } from 'react'
import {
  Sparkles, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus,
  Info, Target, Lightbulb, BarChart3, Building2,
  Telescope, Handshake, MessageSquareQuote, ShieldAlert,
  AlertTriangle, CheckCircle2, Banknote, ArrowRightLeft
} from 'lucide-react'
import clsx from 'clsx'

// ── Helper: skip non-informational values ────────────────────────────────────
const NA_VALS = new Set(['Not Reported', 'Not Applicable', '', null, undefined])
const hasVal = (v) => !NA_VALS.has(v)

// ── Reusable metric card ─────────────────────────────────────────────────────
function Metric({ label, value, qoq, yoy, prev, prevLabel = 'Prev Qtr' }) {
  const parseNum = (v) => {
    if (!hasVal(v)) return null
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
        {Math.abs(num).toFixed(1)}%
      </span>
    )
  }

  const display = hasVal(value) ? value : '—'

  return (
    <div className="flex flex-col p-3 bg-surface border border-border/50 rounded-xl">
      <span className="text-[10px] text-textMuted mb-1 font-semibold uppercase tracking-wider">{label}</span>
      <span className="text-base font-bold text-textPrimary mb-2">{display}</span>
      {hasVal(prev) && (
        <span className="text-[10px] text-textMuted mb-1.5">{prevLabel}: {prev}</span>
      )}
      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
        {pill(qoqNum, 'QoQ ')}
        {pill(yoyNum, 'YoY ')}
      </div>
    </div>
  )
}

// ── Bullet list ──────────────────────────────────────────────────────────────
function BulletList({ items, color = 'text-primary' }) {
  const filtered = (Array.isArray(items) ? items : []).filter(i => hasVal(i))
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

// ── Kv Row (label: value) ────────────────────────────────────────────────────
function KvRow({ label, value }) {
  if (!hasVal(value)) return null
  return (
    <div className="flex items-start gap-3 text-sm py-2 border-b border-white/5 last:border-b-0">
      <span className="text-textMuted w-40 flex-shrink-0 font-medium text-xs leading-relaxed">{label}</span>
      <span className="text-textPrimary leading-relaxed">{value}</span>
    </div>
  )
}

// ── Risk Row ─────────────────────────────────────────────────────────────────
function RiskRow({ label, value }) {
  if (!hasVal(value)) return null
  return (
    <div className="flex items-start gap-2 text-sm py-2.5 border-b border-red-500/10 last:border-b-0">
      <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <span className="text-red-400 font-semibold text-xs">{label}: </span>
        <span className="text-textPrimary">{value}</span>
      </div>
    </div>
  )
}

// ── Sentiment badge ──────────────────────────────────────────────────────────
function SentimentBadge({ value }) {
  if (!hasVal(value)) return null
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
  if (!hasVal(value)) return null
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
function Section({ icon: Icon, title, children, iconColor = 'text-primary', borderColor }) {
  return (
    <div className={clsx('rounded-xl border p-4', borderColor || 'border-white/5 bg-surface/30')}>
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

// ── Main Component ───────────────────────────────────────────────────────────
export default function AiAnalysisPanel({ analysis, generatedAt, cached }) {
  const [expanded, setExpanded] = useState(true)

  if (!analysis || typeof analysis !== 'object') return null
  const a = analysis

  const fin = a.financials || {}
  const fwd = a.forwardLooking || {}
  const str = a.strategicInitiativesAndPartnerships || {}
  const risk = a.riskFactorsAndRedFlags || {}
  const mgmt = a.managementCommentary

  const hasFinancials = fin.applicable !== false &&
    (hasVal(fin.revenue?.current) || hasVal(fin.netProfit?.current))

  const hasForwardLooking = fwd.applicable !== false &&
    Object.values(fwd).some(v => typeof v === 'string' && hasVal(v))

  const hasStrategic = str.applicable !== false &&
    Object.values(str).some(v => typeof v === 'string' && hasVal(v))

  const hasRisks = risk.applicable !== false &&
    Object.values(risk).some(v => typeof v === 'string' && hasVal(v))

  const hasMgmt = Array.isArray(mgmt) && mgmt.some(m => hasVal(m))

  const corporateActionsExist = a.corporateActions &&
    Object.values(a.corporateActions).some(v => hasVal(v))

  const hasCategoryDetails = a.categorySpecificDetails &&
    Object.values(a.categorySpecificDetails).some(v => hasVal(v))

  const hasBalanceSheet = fin.balanceSheetSnapshot &&
    Object.values(fin.balanceSheetSnapshot).some(v => hasVal(v))

  const hasCashFlow = fin.cashFlowHighlights &&
    Object.values(fin.cashFlowHighlights).some(v => hasVal(v))

  const hasMargins = fin.marginAnalysis &&
    Object.values(fin.marginAnalysis).some(v => hasVal(v))

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
              <p className="text-xs text-textPrimary mt-0.5 line-clamp-2 opacity-80">{a.headline}</p>
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
        <div className="px-4 pb-5 space-y-4 border-t border-primary/10" onClick={(e) => e.stopPropagation()}>

          {/* Badges Row */}
          <div className="flex items-center gap-2 flex-wrap pt-4">
            <SentimentBadge value={a.sentiment} />
            <ImportanceBadge value={a.importance} />
            {hasVal(a.announcementCategory) && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-surface border border-border text-textMuted font-medium">
                {a.announcementCategory}
              </span>
            )}
            {hasVal(a.announcementType) && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 font-medium">
                {a.announcementType}
              </span>
            )}
            {hasVal(fin.period) && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
                📅 {fin.period}
              </span>
            )}
          </div>

          {/* Executive Summary */}
          {Array.isArray(a.summary) && a.summary.some(s => hasVal(s)) && (
            <Section icon={Info} title="Executive Summary" iconColor="text-blue-400">
              <BulletList items={a.summary} color="text-blue-400" />
            </Section>
          )}

          {/* Financial Highlights */}
          {hasFinancials && (
            <Section icon={BarChart3} title="Financial Highlights" iconColor="text-emerald-400">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                {hasVal(fin.revenue?.current) && (
                  <Metric label="Revenue" value={fin.revenue.current}
                    prev={fin.revenue.previousQuarter}
                    qoq={fin.revenue.qoqPercent} yoy={fin.revenue.yoyPercent} />
                )}
                {hasVal(fin.grossProfit?.current) && (
                  <Metric label="Gross Profit" value={fin.grossProfit.current}
                    prev={fin.grossProfit.previousQuarter}
                    qoq={fin.grossProfit.qoqPercent} yoy={fin.grossProfit.yoyPercent} />
                )}
                {hasVal(fin.ebitda?.current) && (
                  <Metric label="EBITDA" value={fin.ebitda.current}
                    prev={fin.ebitda.previousQuarter}
                    qoq={fin.ebitda.qoqPercent} yoy={fin.ebitda.yoyPercent} />
                )}
                {hasVal(fin.operatingProfit?.current) && (
                  <Metric label="Operating Profit" value={fin.operatingProfit.current}
                    prev={fin.operatingProfit.previousQuarter}
                    qoq={fin.operatingProfit.qoqPercent} yoy={fin.operatingProfit.yoyPercent} />
                )}
                {hasVal(fin.netProfit?.current) && (
                  <Metric label="Net Profit (PAT)" value={fin.netProfit.current}
                    prev={fin.netProfit.previousQuarter}
                    qoq={fin.netProfit.qoqPercent} yoy={fin.netProfit.yoyPercent} />
                )}
                {hasVal(fin.eps?.current) && (
                  <Metric label="EPS" value={fin.eps.current}
                    prev={fin.eps.previousQuarter}
                    qoq={fin.eps.qoqPercent} yoy={fin.eps.yoyPercent} />
                )}
              </div>

              {/* Margins */}
              {hasMargins && (
                <div className="flex flex-wrap gap-x-5 gap-y-2 mt-1 pt-3 border-t border-white/5">
                  {Object.entries(fin.marginAnalysis).map(([k, v]) =>
                    hasVal(v) ? (
                      <div key={k} className="text-xs text-textMuted">
                        <span className="capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>{' '}
                        <span className="text-textPrimary font-semibold">{v}</span>
                      </div>
                    ) : null
                  )}
                </div>
              )}

              {/* Exceptional Items */}
              {hasVal(fin.exceptionalItems) && (
                <div className="mt-3 pt-3 border-t border-amber-500/15 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 leading-relaxed"><span className="font-bold">Exceptional Items: </span>{fin.exceptionalItems}</p>
                </div>
              )}

              {/* Balance Sheet */}
              {hasBalanceSheet && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Banknote className="w-3 h-3" /> Balance Sheet Snapshot
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                    {Object.entries(fin.balanceSheetSnapshot).map(([k, v]) =>
                      hasVal(v) ? (
                        <div key={k} className="flex items-baseline gap-1.5">
                          <span className="text-[10px] text-textMuted capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>
                          <span className="text-xs text-textPrimary font-semibold">{v}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}

              {/* Cash Flow */}
              {hasCashFlow && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2 flex items-center gap-1">
                    <ArrowRightLeft className="w-3 h-3" /> Cash Flow Highlights
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                    {Object.entries(fin.cashFlowHighlights).map(([k, v]) =>
                      hasVal(v) ? (
                        <div key={k} className="flex items-baseline gap-1.5">
                          <span className="text-[10px] text-textMuted capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>
                          <span className="text-xs text-textPrimary font-semibold">{v}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Key Highlights */}
          {Array.isArray(a.keyHighlights) && a.keyHighlights.some(h => hasVal(h)) && (
            <Section icon={Lightbulb} title="Key Highlights" iconColor="text-amber-400">
              <ul className="space-y-2">
                {a.keyHighlights.filter(h => hasVal(h)).map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-textPrimary leading-relaxed">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Forward Looking */}
          {hasForwardLooking && (
            <Section icon={Telescope} title="Forward-Looking & Guidance" iconColor="text-cyan-400">
              <div className="space-y-0">
                <KvRow label="Guidance" value={fwd.guidance} />
                <KvRow label="Capacity Expansion" value={fwd.capacityExpansionPlans} />
                <KvRow label="Capex Plans" value={fwd.capexPlans} />
                <KvRow label="New Products / Services" value={fwd.newProductOrServicePlans} />
                <KvRow label="New Markets / Geographies" value={fwd.newMarketOrGeographyPlans} />
                <KvRow label="Order Book / Pipeline" value={fwd.orderBookOrPipeline} />
                <KvRow label="M&A / Inorganic Intent" value={fwd.mAndAOrInorganicIntent} />
                <KvRow label="Tech / Digital Plans" value={fwd.technologyOrDigitalInvestmentPlans} />
                <KvRow label="Medium-Term Targets" value={fwd.mediumTermStrategicTargets} />
              </div>
            </Section>
          )}

          {/* Management Commentary */}
          {hasMgmt && (
            <Section icon={MessageSquareQuote} title="Management Commentary" iconColor="text-violet-400">
              <div className="space-y-2.5">
                {mgmt.filter(m => hasVal(m)).map((m, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-1 h-full min-h-[1.25rem] rounded-full bg-violet-400/40 flex-shrink-0 mt-1" />
                    <p className="text-sm text-textPrimary leading-relaxed italic">"{m}"</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Strategic Initiatives */}
          {hasStrategic && (
            <Section icon={Handshake} title="Strategic Initiatives & Partnerships" iconColor="text-indigo-400">
              <div className="space-y-0">
                <KvRow label="Partnerships / JVs / MOUs" value={str.newPartnershipsOrJVsOrMOUs} />
                <KvRow label="Subsidiaries / Stakes" value={str.subsidiariesOrStakeChanges} />
                <KvRow label="Tech / Licensing Tie-ups" value={str.technologyOrLicensingTieUps} />
                <KvRow label="Govt. Scheme" value={str.governmentSchemeParticipation} />
                <KvRow label="ESG / Sustainability" value={str.esgOrSustainabilityInitiatives} />
              </div>
            </Section>
          )}

          {/* Corporate Actions */}
          {corporateActionsExist && (
            <Section icon={Building2} title="Corporate Actions" iconColor="text-primary">
              <div className="space-y-0">
                <KvRow label="Dividend" value={a.corporateActions?.dividend} />
                <KvRow label="Stock Split" value={a.corporateActions?.stockSplit} />
                <KvRow label="Bonus Issue" value={a.corporateActions?.bonusIssue} />
                <KvRow label="Buyback" value={a.corporateActions?.buyback} />
                <KvRow label="Rights Issue" value={a.corporateActions?.rightsIssue} />
                <KvRow label="Merger" value={a.corporateActions?.merger} />
                <KvRow label="Acquisition" value={a.corporateActions?.acquisition} />
                <KvRow label="Fund Raise" value={a.corporateActions?.fundRaise} />
                <KvRow label="Board Changes" value={a.corporateActions?.boardChanges} />
                <KvRow label="Mgmt Changes" value={a.corporateActions?.managementChanges} />
                <KvRow label="Credit Rating" value={a.corporateActions?.creditRatingChange} />
                <KvRow label="Regulatory" value={a.corporateActions?.litigationOrRegulatory} />
              </div>
            </Section>
          )}

          {/* Risk Factors & Red Flags */}
          {hasRisks && (
            <Section icon={ShieldAlert} title="Risk Factors & Red Flags" iconColor="text-red-400" borderColor="border-red-500/20 bg-red-900/5">
              <div className="space-y-0">
                <RiskRow label="Auditor / Going Concern" value={risk.auditorQualificationOrGoingConcern} />
                <RiskRow label="Related-Party Transactions" value={risk.materialRelatedPartyTransactions} />
                <RiskRow label="Litigation / Regulatory" value={risk.litigationOrRegulatoryNotices} />
                <RiskRow label="Credit Rating Concerns" value={risk.creditRatingConcerns} />
                <RiskRow label="Guidance Miss / Delay" value={risk.guidanceMissOrDelay} />
                <RiskRow label="Mgmt Departure" value={risk.keyManagementDepartureWithoutSuccession} />
              </div>
            </Section>
          )}

          {/* Category-specific details */}
          {hasCategoryDetails && (() => {
            const csd = a.categorySpecificDetails
            return (
              <Section icon={Target} title="Filing Details" iconColor="text-cyan-400">
                <div className="space-y-0">
                  <KvRow label="Resolutions" value={csd.meetingResolutions} />
                  <KvRow label="Voting" value={csd.votingResults} />
                  <KvRow label="Notice" value={csd.noticeDetails} />
                  <KvRow label="Compliance" value={csd.complianceStatus} />
                  <KvRow label="Highlights" value={csd.pressReleaseHighlights} />
                </div>
              </Section>
            )
          })()}

          {/* Footer */}
          <p className="text-[10px] text-textMuted opacity-40 pt-1 border-t border-border/30 text-center">
            Tatvarth AI · For informational purposes only · Not financial advice
          </p>
        </div>
      )}
    </div>
  )
}
