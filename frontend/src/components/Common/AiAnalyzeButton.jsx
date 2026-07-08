import { useState, useEffect, useRef } from 'react'
import { Sparkles, RefreshCw, AlertCircle, Clock } from 'lucide-react'
import clsx from 'clsx'
import { analyzeAnnouncement } from '../../services/announcementService'

const LOADING_STAGES = [
  'Reading PDF…',
  'Extracting financial data…',
  'Understanding the filing…',
  'Generating investment analysis…',
  'Almost ready…',
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
export default function AiAnalyzeButton({ announcementId, pdfUrl, initialAnalysis, onResult }) {
  const hasCached = initialAnalysis?.generated === true

  const [state, setState] = useState(hasCached ? 'cached' : 'idle') // idle | cached | loading | error
  const [errorMsg, setErrorMsg] = useState('')
  const [stageIdx, setStageIdx] = useState(0)
  const stageTimer = useRef(null)

  // If parent passes updated initialAnalysis (e.g. after page re-render), sync
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

    // If cached, just surface the result immediately
    if (state === 'cached' && initialAnalysis?.analysis) {
      onResult?.(initialAnalysis.analysis)
      return
    }

    if (state === 'loading') return

    setState('loading')
    setErrorMsg('')
    startStageTimer()

    try {
      const result = await analyzeAnnouncement(announcementId)
      stopStageTimer()
      setState('cached')
      onResult?.(result.analysis)
    } catch (err) {
      stopStageTimer()
      setState('error')
      // Parse friendly error message
      const raw = err.message || ''
      if (raw.includes('PDF unavailable') || raw.includes('NO_PDF')) {
        setErrorMsg('PDF unavailable for this filing.')
      } else if (raw.includes('422')) {
        setErrorMsg('Unable to access the filing PDF.')
      } else {
        setErrorMsg('Analysis failed. Please try again.')
      }
    }
  }

  // ── No PDF → hide button entirely ──────────────────────────────────────────
  if (!pdfUrl) return null

  // ── Error state ─────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
        <button
          onClick={handleClick}
          className="text-xs px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/25 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
        <span className="text-xs text-primary font-medium transition-all duration-500">
          {LOADING_STAGES[stageIdx]}
        </span>
      </div>
    )
  }

  // ── Cached state — green "AI Ready" pill ────────────────────────────────────
  if (state === 'cached') {
    return (
      <button
        onClick={handleClick}
        title="AI analysis available — click to view"
        className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
          'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400',
          'hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-200',
          'hover:shadow-[0_0_12px_rgba(52,211,153,0.15)]'
        )}
      >
        <Sparkles className="w-3.5 h-3.5" />
        AI Ready
      </button>
    )
  }

  // ── Idle state — gradient "AI Analyze" button ───────────────────────────────
  return (
    <button
      onClick={handleClick}
      title="Generate AI investment analysis (~15–30s)"
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
        'text-white transition-all duration-200 group',
        'bg-gradient-to-r from-violet-600 to-indigo-600',
        'hover:from-violet-500 hover:to-indigo-500',
        'hover:shadow-[0_0_16px_rgba(139,92,246,0.35)] hover:scale-[1.02]',
        'active:scale-[0.98]'
      )}
    >
      <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform duration-200" />
      <span>AI Analyze</span>
      <span className="flex items-center gap-1 text-white/60 font-normal text-[10px]">
        <Clock className="w-2.5 h-2.5" />
        ~20s
      </span>
    </button>
  )
}
