import { useState, useEffect, useRef } from 'react'
import { Sparkles, RefreshCw, AlertCircle, Clock, Crown } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import { analyzeAnnouncement } from '../../services/announcementService'
import UpgradePromptModal from '../Plans/UpgradePromptModal'

const LOADING_STAGES = [
  '📄 Downloading Statutory PDF (BSE/NSE CDN)...',
  '🔍 Multimodal Vision OCR: Examining balance sheets, tables & notes...',
  '📊 Extracting YoY / QoQ Growth, EBITDA Margins & Forward Guidance...',
  '✨ Finalizing Institutional Brief...',
]

/**
 * AiAnalyzeButton
 *
 * Self-contained button that drives the full AI analyze lifecycle:
 *   idle (no analysis) → loading → success → shows AiAnalysisPanel
 *   idle (cached)      → instantly expands panel on click
 *   error              → shows retry button
 *
 * Props:
 *   announcementId  — MongoDB _id of the announcement
 *   pdfUrl          — used to decide whether to show the button at all
 *   initialAnalysis — aiAnalysis object from DB (if already cached)
 *   onResult(analysis) — called when analysis is ready (new or cached)
 */
export default function AiAnalyzeButton({ announcementId, pdfUrl, initialAnalysis, announcement, onResult }) {
  const hasCached = initialAnalysis?.generated === true

  const [state, setState] = useState(hasCached ? 'cached' : 'idle') // idle | cached | loading | error
  const [errorMsg, setErrorMsg] = useState('')
  const [stageIdx, setStageIdx] = useState(0)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const stageTimer = useRef(null)

  const { plan, isPro, isPremium, dailyAiCount, planLimits } = useAuth()
  const maxAi = planLimits?.maxAiDaily ?? 3

  useEffect(() => {
    if (initialAnalysis?.generated && state === 'idle') {
      setState('cached')
    }
  }, [initialAnalysis, state])

  function startStageTimer() {
    setStageIdx(0)
    stageTimer.current = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, LOADING_STAGES.length - 1))
    }, 5000)
  }

  function stopStageTimer() {
    if (stageTimer.current) {
      clearInterval(stageTimer.current)
      stageTimer.current = null
    }
  }

  useEffect(() => () => stopStageTimer(), [])

  async function handleClick(e) {
    e.stopPropagation()

    if (state === 'cached' && initialAnalysis?.analysis) {
      onResult?.(initialAnalysis.analysis)
      return
    }

    if (state === 'loading') return

    // Daily limit check for generating fresh analysis on basic tier
    if (maxAi !== Infinity && (dailyAiCount || 0) >= maxAi) {
      setUpgradeModalOpen(true)
      return
    }

    setState('loading')
    setErrorMsg('')
    startStageTimer()

    try {
      const result = await analyzeAnnouncement(announcementId, false, announcement)
      stopStageTimer()
      setState('cached')
      onResult?.(result.analysis)
    } catch (err) {
      stopStageTimer()
      const raw = err.message || ''
      if (raw.includes('AI analysis limit reached') || raw.includes('PLAN_LIMIT_REACHED') || err.status === 403) {
        setState('idle')
        setUpgradeModalOpen(true)
        return
      }
      setState('error')
      if (raw.includes('PDF unavailable') || raw.includes('NO_PDF')) {
        setErrorMsg('PDF unavailable for this filing.')
      } else if (raw.includes('422')) {
        setErrorMsg('Unable to access the filing PDF.')
      } else {
        setErrorMsg('Analysis failed. Please try again.')
      }
    }
  }

  if (!pdfUrl) return null

  const keyframeStyles = (
    <style>{`
      @keyframes tswStageFade {
        0%   { opacity: 0; transform: translateY(3px); }
        15%  { opacity: 1; transform: translateY(0); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes tswReadyGlow {
        0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.18); }
        50%      { box-shadow: 0 0 0 5px rgba(52,211,153,0); }
      }
      @keyframes tswShimmer {
        0%   { transform: translateX(-120%); }
        100% { transform: translateX(220%); }
      }
      @keyframes tswFadeIn {
        from { opacity: 0; transform: translateY(-2px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  )

  // ── Error state ─────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div
        className="flex items-center gap-2 flex-wrap max-w-full"
        style={{ animation: 'tswFadeIn 0.2s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {keyframeStyles}
        <div className="flex items-center gap-1.5 text-red-400 text-xs min-w-0">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{errorMsg}</span>
        </div>
        <button
          onClick={handleClick}
          className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400
                     hover:bg-red-500/10 hover:border-red-500/50 active:scale-95 transition-all duration-150"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (state === 'loading') {
    const progressPct = ((stageIdx + 1) / LOADING_STAGES.length) * 100
    return (
      <div
        className="inline-flex flex-col gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/25
                   cursor-default w-full max-w-[280px] sm:w-auto sm:max-w-none shadow-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {keyframeStyles}
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
            <span key={stageIdx} className="text-xs text-primary font-semibold truncate" style={{ animation: 'tswStageFade 0.4s ease-out' }}>
              {LOADING_STAGES[stageIdx]}
            </span>
          </div>
          <span className="text-[10px] text-primary/70 font-mono font-bold flex-shrink-0">
            {stageIdx + 1}/{LOADING_STAGES.length}
          </span>
        </div>
        {/* Stage progress — gives a real sense of "how close", not just spinning text */}
        <div className="h-[3px] w-full sm:w-44 bg-primary/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-primary to-emerald-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    )
  }

  // ── Cached state — green "AI Ready" pill ────────────────────────────────────
  if (state === 'cached') {
    return (
      <>
        {keyframeStyles}
        <button
          onClick={handleClick}
          title="AI analysis available — click to view"
          aria-label="View AI analysis"
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
            'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400',
            'hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:-translate-y-0.5',
            'active:scale-95 transition-all duration-200'
          )}
          style={{ animation: 'tswReadyGlow 2.5s ease-in-out infinite' }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Ready
        </button>
      </>
    )
  }

  // ── Idle state — gradient "AI Analyze" button ───────────────────────────────
  return (
    <>
      {keyframeStyles}
      <button
        onClick={handleClick}
        title="Generate AI investment analysis (~15–30s)"
        aria-label="Generate AI investment analysis"
        className={clsx(
          'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
          'text-white transition-all duration-200 group overflow-hidden',
          'bg-gradient-to-r from-violet-600 to-indigo-600',
          'hover:from-violet-500 hover:to-indigo-500',
          'hover:shadow-[0_0_16px_rgba(139,92,246,0.35)] hover:scale-[1.02]',
          'active:scale-[0.98]'
        )}
      >
        {/* Diagonal shimmer sweep on hover — signals "this triggers something special" (an AI action) */}
        <span className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
          <span
            className="absolute inset-y-0 w-8 bg-white/20 -skew-x-12 opacity-0 group-hover:opacity-100"
            style={{ animation: 'tswShimmer 1s ease-in-out infinite' }}
          />
        </span>

        <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform duration-200 relative z-10" />
        <span className="relative z-10">AI Analyze</span>
        {/* Daily limit badge for basic users */}
        {maxAi !== Infinity && (
          <span className="hidden sm:inline text-[10px] text-violet-200/90 font-mono font-medium px-1.5 py-0.2 bg-black/25 rounded relative z-10">
            {dailyAiCount || 0}/{maxAi}
          </span>
        )}
        {/* Hidden on very narrow layouts (mobile announcement cards) to keep the button compact */}
        <span className="hidden xs:flex sm:flex items-center gap-1 text-white/60 font-normal text-[10px] relative z-10">
          <Clock className="w-2.5 h-2.5" />
          ~20s
        </span>
      </button>

      <UpgradePromptModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Daily AI Limit Reached"
        message={`You've reached your free daily limit of ${maxAi} Gemini AI filings analyses for today. Upgrade to Pro for unlimited PDF extraction, YoY/QoQ breakdown, and institutional guidance.`}
        targetTier="pro"
      />
    </>
  )
}