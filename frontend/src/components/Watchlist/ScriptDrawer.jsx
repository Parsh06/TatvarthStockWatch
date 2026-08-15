import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink, FileText, Bell, Briefcase, BarChart2 } from 'lucide-react'
import clsx from 'clsx'
import { getExchangeColor, formatRelativeDate, getCategoryColor } from '../../utils/formatters'
import { updateScript } from '../../services/watchlistService'
import { FIREBASE_ENABLED } from '../../services/firebase'
import { fetchBSEAnnouncements } from '../../services/announcementService'
import { useAuth } from '../../contexts/AuthContext'
import { SkeletonAnnouncementCard } from '../Common/Loader'
import toast from 'react-hot-toast'
import { apiClient } from '../../services/apiClient'

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
  const [notes, setNotes]                 = useState(script?.notes || '')
  const [savingNotes, setSavingNotes]     = useState(false)

  const isOpen = !!script
  const code   = script?.ltdCode || script?.bseCode || ''
  const symbol = script?.symbol  || ''

  // Escape to close
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [isOpen])

  // Fetch data
  useEffect(() => {
    if (!script) return
    setNotes(script.notes || '')
    setAnnouncements([])

    setAnnLoading(true)
    loadAnnouncementsForScript(code, symbol)
      .then(setAnnouncements).catch(() => setAnnouncements([]))
      .finally(() => setAnnLoading(false))
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

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes tswDialogBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tswDialogIn {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        style={{ animation: 'tswDialogBackdrop 0.18s ease-out' }}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        style={{ animation: 'tswDialogIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
        className="relative flex flex-col bg-surface border border-border rounded-2xl w-full max-w-lg
                   shadow-2xl shadow-black/40 max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-background/50 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-textPrimary leading-snug truncate pr-2 text-lg">{script?.scriptName}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {code   && <code className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20">{code}</code>}
              {symbol && <code className="text-xs font-mono text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded border border-orange-400/20">{symbol}</code>}
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded border', getExchangeColor(script?.exchange))}>
                {script?.exchange || 'BSE'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-textMuted hover:bg-white/5 hover:text-textPrimary transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Quick action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => { onClose(); navigate('/company-data', { state: { script: { bseCode: code, scripName: script?.scriptName, symbol } } }) }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-semibold transition-colors duration-150"
            >
              <BarChart2 className="w-4 h-4" /> Company Data
            </button>
            <button
              onClick={() => { onClose(); navigate('/portfolio', { state: { addScript: { bseCode: code, scripName: script?.scriptName, symbol, isin: script?.isin || '' } } }) }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-surface border border-border hover:border-primary/40 rounded-xl text-xs text-textPrimary hover:text-primary transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg shadow-black/10"
            >
              <Briefcase className="w-4 h-4 text-primary/70" /> Add to Portfolio
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">My Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleNotesSave}
              placeholder="Add personal notes about this script…"
              rows={3}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-3 text-textPrimary placeholder-textMuted/40 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 text-sm resize-none transition-all duration-150"
            />
            {savingNotes && <p className="text-xs text-primary/60 mt-1.5 animate-pulse">Saving changes…</p>}
          </div>

          {/* Announcements */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Recent Announcements</h3>
              {!annLoading && announcements.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-400/15 text-amber-400 text-[10px] font-bold rounded-full">
                  {announcements.length}
                </span>
              )}
            </div>

            {annLoading ? (
              <div className="space-y-2.5">
                {[1, 2].map(i => <SkeletonAnnouncementCard key={i} />)}
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 bg-background/50 border border-border/50 rounded-xl text-center">
                <Bell className="w-6 h-6 text-textMuted/40 mb-2" />
                <p className="text-sm font-medium text-textPrimary mb-0.5">No announcements found</p>
                <p className="text-xs text-textMuted">Use <strong>Fetch News</strong> on the watchlist to load today's data</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {announcements.map(a => (
                  <div key={a.id} className="bg-background border border-border rounded-xl p-3.5 hover:border-primary/30 transition-colors duration-150">
                    <div className="flex items-start gap-3">
                      <div className={clsx('w-1 rounded-full self-stretch flex-shrink-0', a.exchange === 'NSE' ? 'bg-orange-400/60' : 'bg-blue-400/60')} style={{ minHeight: 32 }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider',
                            a.exchange === 'NSE' ? 'bg-orange-400/15 text-orange-400' : 'bg-blue-400/15 text-blue-400')}>
                            {a.exchange || 'BSE'}
                          </span>
                          {a.category && (
                            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border', getCategoryColor(a.category))}>
                              {a.category}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-textPrimary line-clamp-2 leading-relaxed">
                          {a.subject || a.headline || a.description}
                        </p>
                        <p className="text-xs text-textMuted/60 mt-1.5 font-medium">{a.datetimeIST || formatRelativeDate(a.announcementDate || a.date)}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {a.pdfUrl && (
                          <a href={a.pdfUrl} target="_blank" rel="noopener noreferrer"
                             className="p-1.5 text-textMuted hover:text-primary hover:bg-primary/10 transition-colors rounded-lg" title="View PDF">
                            <FileText className="w-4 h-4" />
                          </a>
                        )}
                        {a.sourceUrl && (
                          <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer"
                             className="p-1.5 text-textMuted hover:text-primary hover:bg-white/5 transition-colors rounded-lg" title="View on BSE">
                            <ExternalLink className="w-4 h-4" />
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
  )
}
