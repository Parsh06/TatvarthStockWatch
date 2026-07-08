import { useState, useEffect } from 'react'
import { X, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { apiClient } from '../../services/apiClient'

export default function AiInsightDrawer({ row, onClose }) {
  const [loading, setLoading] = useState(true)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!row) return
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      setAnalysis(null)
      try {
        // Try to find the most recent announcement for this company
        const code = row.bseCode || row.symbol || ''
        const searchRes = await apiClient(`/api/announcements?scriptCode=${code}&limit=1`)
        const list = searchRes?.data ?? searchRes
        const latest = Array.isArray(list) ? list[0] : null

        if (!latest) {
          if (!cancelled) setError('No recent announcements found for this stock.')
          return
        }

        const res = await apiClient(`/api/announcements/${latest.id}/analyze`, { method: 'POST' })
        if (!cancelled) setAnalysis(res.analysis || res)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to generate AI insight.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [row])

  if (!row) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#13141a] border-l border-white/10 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-semibold text-lg">AI Insight</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg text-textMuted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Company Info */}
        <div className="px-6 pt-5 pb-3 border-b border-white/5">
          <h3 className="text-xl font-bold text-textPrimary">{row.company || row.symbol}</h3>
          <div className="flex gap-4 mt-2 text-sm text-textMuted">
            {row.bseCode && <span>BSE: {row.bseCode}</span>}
            {row.symbol  && <span>Symbol: {row.symbol}</span>}
          </div>
          {row.volMultiple > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs px-3 py-1.5 rounded-full">
              <span>🔥</span>
              <span>{row.volMultiple.toFixed(1)}x Usual Volume</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-textMuted">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="animate-pulse text-sm">Generating AI market insight…</p>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          ) : analysis ? (
            <div className="space-y-6 text-sm">
              {analysis.summary && (
                <div>
                  <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Summary</h4>
                  <p className="text-textPrimary leading-relaxed">{analysis.summary}</p>
                </div>
              )}
              {analysis.sentiment && (
                <div>
                  <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Sentiment</h4>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border
                    ${analysis.sentiment === 'Positive' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      analysis.sentiment === 'Negative' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                    {analysis.sentiment}
                  </span>
                </div>
              )}
              {analysis.keyPoints?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Key Drivers</h4>
                  <ul className="space-y-2">
                    {analysis.keyPoints.map((pt, i) => (
                      <li key={i} className="flex gap-2 text-textPrimary">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
