import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink, FileText, Bell, TrendingUp, TrendingDown, Briefcase, BarChart2, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import clsx from 'clsx'
import { getExchangeColor, formatRelativeDate, fmtN, getCategoryColor } from '../../utils/formatters'
import { updateScript } from '../../services/watchlistService'
import { apiClient } from '../../services/apiClient'
import { FIREBASE_ENABLED } from '../../services/firebase'
import { fetchBSEAnnouncements } from '../../services/announcementService'
import { useAuth } from '../../contexts/AuthContext'
import { SkeletonAnnouncementCard } from '../Common/Loader'
import toast from 'react-hot-toast'

const BACKEND = import.meta.env.VITE_BACKEND_URL || ''

async function loadAnnouncementsForScript(ltdCode, symbol) {
  if (!ltdCode && !symbol) return []
  if (!FIREBASE_ENABLED) {
    const fetches = []
    if (ltdCode) fetches.push(apiClient(`/api/announcements?scriptCode=${encodeURIComponent(ltdCode)}`).then(j => j.data || []))
    if (symbol && symbol !== ltdCode) fetches.push(apiClient(`/api/announcements?scriptCode=${encodeURIComponent(symbol)}`).then(j => j.data || []))
    const results = await Promise.all(fetches)
    const seen = new Set(); const merged = []
    for (const ann of results.flat()) {
      if (!seen.has(ann.id)) { seen.add(ann.id); merged.push(ann) }
    }
    return merged.sort((a, b) => (b.announcementDate || '').localeCompare(a.announcementDate || '')).slice(0, 20)
  }
  return fetchBSEAnnouncements(ltdCode).then(d => (Array.isArray(d) ? d : []).slice(0, 20))
}

export default function ScriptDrawer({ script, onClose }) {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [annLoading, setAnnLoading]       = useState(false)
  const [quote, setQuote]                 = useState(null)
  const [quoteLoading, setQL]             = useState(false)
  const [notes, setNotes]                 = useState(script?.notes || '')
  const [savingNotes, setSavingNotes]     = useState(false)

  const isOpen = !!script
  const code   = script?.ltdCode || script?.bseCode || ''
  const symbol = script?.symbol  || ''

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!script) return
    setNotes(script.notes || '')
    setAnnouncements([]); setQuote(null)

    // Load announcements
    setAnnLoading(true)
    loadAnnouncementsForScript(code, symbol)
      .then(setAnnouncements).catch(() => setAnnouncements([]))
      .finally(() => setAnnLoading(false))

    // Load live quote
    if (!code) return
    setQL(true)
    fetch(`${BACKEND}/api/bse/quote?codes=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => setQuote(d.quotes?.[code] || null))
      .catch(() => {})
      .finally(() => setQL(false))
  }, [script?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNotesSave() {
    if (!currentUser || !script) return
    setSavingNotes(true)
    try {
      await updateScript(currentUser.uid, script.id, { notes })
      toast.success('Notes saved')
    } catch { toast.error('Failed to save notes') }
    finally { setSavingNotes(false) }
  }

  const ltp     = quote?.ltp ?? null
  const change  = quote?.change ?? null
  const pct     = quote?.pctChange ?? null
  const up      = change != null && change >= 0

  return (
    <>
      <div
        className={clsx('fixed inset-0 bg-black/40 z-40 transition-opacity', isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        onClick={onClose}
      />

      <div className={clsx(
        'fixed top-0 right-0 h-full w-full sm:w-[460px] bg-surface border-l border-border z-50 flex flex-col shadow-2xl transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-textPrimary leading-snug truncate pr-2">{script?.scriptName}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {code   && <code className="text-xs font-mono text-blue-400   bg-blue-400/10   px-2 py-0.5 rounded">{code}</code>}
              {symbol && <code className="text-xs font-mono text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded">{symbol}</code>}
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded', getExchangeColor(script?.exchange))}>
                {script?.exchange || 'BSE'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textPrimary transition ml-2 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Live Quote card */}
          <div className="px-5 pt-4 pb-2">
            <div className={clsx(
              'rounded-xl border p-4',
              quote ? 'border-primary/20 bg-primary/5' : 'border-border bg-background/40'
            )}>
              {quoteLoading ? (
                <div className="flex items-center gap-2 text-xs text-primary/60">
                  <span className="w-3.5 h-3.5 border-2 border-primary/50 border-t-transparent rounded-full animate-spin" />
                  Loading live price…
                </div>
              ) : ltp != null ? (
                <div>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div>
                      <p className="text-[10px] text-textMuted uppercase tracking-wider mb-0.5">LTP</p>
                      <p className="text-2xl font-bold text-textPrimary tabular-nums">₹{fmtN(ltp)}</p>
                    </div>
                    {change != null && (
                      <div className={clsx(
                        'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold mb-0.5',
                        up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      )}>
                        {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {up ? '+' : ''}{fmtN(change)} ({up ? '+' : ''}{fmtN(pct)}%)
                      </div>
                    )}
                  </div>
                  {(quote.open || quote.high || quote.low || quote.prevClose) && (
                    <div className="flex items-center gap-4 mt-2 text-xs text-textMuted flex-wrap">
                      {quote.prevClose && <span>Prev <span className="text-textPrimary font-medium">₹{fmtN(quote.prevClose)}</span></span>}
                      {quote.open      && <span>O <span className="text-textPrimary font-medium">₹{fmtN(quote.open)}</span></span>}
                      {quote.high      && <span>H <span className="text-emerald-400 font-medium">₹{fmtN(quote.high)}</span></span>}
                      {quote.low       && <span>L <span className="text-red-400 font-medium">₹{fmtN(quote.low)}</span></span>}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-textMuted/50 italic">Live price unavailable from BSE</p>
              )}
            </div>

            {/* Quick action buttons */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { onClose(); navigate('/company-data', { state: { script: { bseCode: code, scripName: script?.scriptName, symbol } } }) }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-background border border-border rounded-xl text-xs text-textMuted hover:text-primary hover:border-primary/40 transition"
              >
                <BarChart2 className="w-3.5 h-3.5" /> Company Data
              </button>
              <button
                onClick={() => { onClose(); navigate('/portfolio', { state: { addScript: { bseCode: code, scripName: script?.scriptName, symbol, isin: script?.isin || '' }, liveQuote: quote } }) }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-background border border-border rounded-xl text-xs text-textMuted hover:text-emerald-400 hover:border-emerald-500/40 transition"
              >
                <Briefcase className="w-3.5 h-3.5" /> Add to Portfolio
              </button>
            </div>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={handleNotesSave}
                placeholder="Add notes about this script…"
                rows={3}
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-textPrimary placeholder-textMuted/40 focus:outline-none focus:border-primary/60 text-sm resize-none transition"
              />
              {savingNotes && <p className="text-xs text-primary/60 mt-1">Saving…</p>}
            </div>

            {/* Announcements */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Recent Announcements</h3>
                {!annLoading && announcements.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-400/15 text-amber-400 text-xs font-medium rounded-full">
                    {announcements.length}
                  </span>
                )}
              </div>

              {annLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <SkeletonAnnouncementCard key={i} />)}
                </div>
              ) : announcements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="w-7 h-7 text-textMuted/20 mb-2" />
                  <p className="text-sm text-textMuted">No announcements found</p>
                  <p className="text-xs text-textMuted/50 mt-0.5">Use <strong>Fetch News</strong> to load today's data</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {announcements.map(a => (
                    <div key={a.id} className="bg-background border border-border rounded-xl p-3 hover:border-primary/30 transition">
                      <div className="flex items-start gap-2.5">
                        <div className={clsx('w-1 rounded-full self-stretch flex-shrink-0', a.exchange === 'NSE' ? 'bg-orange-400' : 'bg-blue-400')} style={{ minHeight: 32 }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className={clsx('text-xs font-semibold px-1.5 py-0.5 rounded',
                              a.exchange === 'NSE' ? 'bg-orange-400/15 text-orange-400' : 'bg-blue-400/15 text-blue-400')}>
                              {a.exchange || 'BSE'}
                            </span>
                            {a.category && (
                              <span className={clsx('text-xs px-1.5 py-0.5 rounded border', getCategoryColor(a.category))}>
                                {a.category}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-textPrimary line-clamp-2 leading-snug">
                            {a.subject || a.headline || a.description}
                          </p>
                          <p className="text-xs text-textMuted/50 mt-1">{a.datetimeIST || formatRelativeDate(a.announcementDate || a.date)}</p>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {a.pdfUrl && (
                            <a href={a.pdfUrl} target="_blank" rel="noopener noreferrer"
                               className="p-1.5 text-textMuted hover:text-primary transition rounded" title="View PDF">
                              <FileText className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {a.sourceUrl && (
                            <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer"
                               className="p-1.5 text-textMuted hover:text-primary transition rounded" title="View on BSE">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
