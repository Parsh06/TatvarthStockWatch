import { useState, useEffect } from 'react'
import { X, Star, CheckCircle2, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import clsx from 'clsx'
import { useWatchlist } from '../../contexts/WatchlistContext'
import ScriptSearchInput from '../Common/ScriptSearchInput'
import toast from 'react-hot-toast'

const BACKEND    = import.meta.env.VITE_BACKEND_URL || ''
const EXCHANGES  = ['BSE', 'NSE', 'BOTH']
const PRESET_GROUPS = ['Banking', 'IT', 'Pharma', 'Energy', 'FMCG', 'Auto', 'Infrastructure', 'Consumer', 'Metals', 'Telecom']

function fmtN(v, dec = 2) {
  if (v == null) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export default function AddScriptModal({ isOpen, onClose }) {
  const { watchlist, addScript } = useWatchlist()
  const existingGroups   = [...new Set(watchlist.map(s => s.group).filter(Boolean))]
  const groupSuggestions = [...new Set([...existingGroups, ...PRESET_GROUPS])]

  // step: 'search' | 'confirm'
  const [step, setStep]         = useState('search')
  const [selected, setSelected] = useState(null)
  const [liveQuote, setLiveQ]   = useState(null)
  const [quoteLoading, setQL]   = useState(false)
  const [exchange, setExchange] = useState('BSE')
  const [group, setGroup]       = useState('')
  const [notes, setNotes]       = useState('')
  const [adding, setAdding]     = useState(false)

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('search'); setSelected(null); setLiveQ(null)
      setExchange('BSE'); setGroup(''); setNotes(''); setAdding(false)
    }
  }, [isOpen])

  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [isOpen, onClose])

  // Fetch live quote when a script is selected
  useEffect(() => {
    if (!selected?.bseCode) return
    let cancelled = false
    setQL(true); setLiveQ(null)
    fetch(`${BACKEND}/api/bse/quote?codes=${selected.bseCode}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setLiveQ(d.quotes?.[selected.bseCode] || null)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setQL(false) })
    return () => { cancelled = true }
  }, [selected?.bseCode])

  function handleSelect(item) {
    if (!item) return
    setSelected(item)
    setStep('confirm')
  }

  const alreadyInWL = selected
    ? watchlist.some(s => (s.ltdCode || s.bseCode || '') === selected.bseCode)
    : false

  async function handleAdd() {
    if (!selected) return
    if (alreadyInWL) return toast('Already in watchlist', { icon: '⭐' })
    setAdding(true)
    try {
      await addScript({
        scriptName: selected.scripName,
        ltdCode:    selected.bseCode,
        nseSymbol:  selected.symbol  || '',
        isin:       selected.isin    || '',
        exchange,
        group:      group.trim() || undefined,
        notes:      notes.trim() || undefined,
      })
      toast.success(`${selected.scripName} added to watchlist`)
      onClose()
    } catch {
      toast.error('Failed to add script')
    } finally {
      setAdding(false)
    }
  }

  if (!isOpen) return null

  const up  = liveQuote?.pctChange != null && liveQuote.pctChange >= 0
  const ltp = liveQuote?.ltp

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* KEY: no overflow-hidden so dropdown is never clipped */}
      <div className="relative bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col"
           style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-semibold text-textPrimary flex items-center gap-2">
              <Star className="w-4 h-4 text-warning" />
              {step === 'search' ? 'Add to Watchlist' : 'Confirm & Add'}
            </h2>
            {step === 'confirm' && selected && (
              <p className="text-xs text-textMuted mt-0.5 truncate">{selected.scripName} · BSE {selected.bseCode}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/5 transition ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Step 1: Search ── */}
        {step === 'search' && (
          <div className="px-5 py-5 space-y-3" style={{ overflow: 'visible' }}>
            <p className="text-sm text-textMuted">Search for any BSE-listed company by name, symbol or code.</p>
            <div style={{ minHeight: '300px', overflow: 'visible', position: 'relative' }}>
              <ScriptSearchInput
                placeholder="Company name, symbol or BSE code…"
                onSelect={handleSelect}
                className="w-full"
              />
            </div>
            <p className="text-xs text-center text-textMuted/30">Powered by BSE India public data</p>
          </div>
        )}

        {/* ── Step 2: Confirm ── */}
        {step === 'confirm' && selected && (
          <div className="overflow-y-auto flex-1">
            <div className="px-5 py-5 space-y-4">

              {/* Company card with live price */}
              <div className={clsx(
                'rounded-2xl border p-4',
                liveQuote ? 'border-primary/25 bg-primary/5' : 'border-border bg-background/40'
              )}>
                {/* Company info */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">
                      {(selected.scripName || '??').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-textPrimary leading-snug truncate">{selected.scripName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">BSE: {selected.bseCode}</code>
                      {selected.symbol && <code className="text-xs font-mono text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">NSE: {selected.symbol}</code>}
                      {selected.isin   && <span className="text-xs text-textMuted/60">{selected.isin}</span>}
                    </div>
                  </div>
                  {alreadyInWL && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold flex-shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" /> In WL
                    </span>
                  )}
                </div>

                {/* Live price */}
                {quoteLoading ? (
                  <div className="flex items-center gap-2 text-xs text-primary/60">
                    <span className="w-3.5 h-3.5 border-2 border-primary/50 border-t-transparent rounded-full animate-spin inline-block" />
                    Fetching live price…
                  </div>
                ) : liveQuote && ltp != null ? (
                  <div>
                    <div className="flex items-end gap-3 flex-wrap">
                      <div>
                        <p className="text-[10px] text-textMuted uppercase tracking-wider mb-0.5">LTP</p>
                        <p className="text-2xl font-bold text-textPrimary tabular-nums">₹{fmtN(ltp)}</p>
                      </div>
                      {liveQuote.pctChange != null && (
                        <div className={clsx(
                          'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold mb-0.5',
                          up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        )}>
                          {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {up ? '+' : ''}{fmtN(liveQuote.change)} ({up ? '+' : ''}{fmtN(liveQuote.pctChange)}%)
                        </div>
                      )}
                    </div>
                    {(liveQuote.open || liveQuote.high || liveQuote.low || liveQuote.prevClose) && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-textMuted flex-wrap">
                        {liveQuote.prevClose && <span>Prev <span className="text-textPrimary font-medium">₹{fmtN(liveQuote.prevClose)}</span></span>}
                        {liveQuote.open      && <span>O <span className="text-textPrimary font-medium">₹{fmtN(liveQuote.open)}</span></span>}
                        {liveQuote.high      && <span>H <span className="text-emerald-400 font-medium">₹{fmtN(liveQuote.high)}</span></span>}
                        {liveQuote.low       && <span>L <span className="text-red-400 font-medium">₹{fmtN(liveQuote.low)}</span></span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-textMuted/40 italic">Live price unavailable</p>
                )}
              </div>

              {/* Exchange selector */}
              <div>
                <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2 block">Exchange</label>
                <div className="flex gap-2">
                  {EXCHANGES.map(ex => (
                    <button key={ex} type="button" onClick={() => setExchange(ex)}
                      className={clsx(
                        'flex-1 py-2 rounded-xl text-sm font-medium border transition',
                        exchange === ex
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-background border-border text-textMuted hover:border-primary/40'
                      )}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group / Sector */}
              <div>
                <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2 block">
                  Sector / Group <span className="font-normal text-textMuted/50">(optional)</span>
                </label>
                <input type="text" value={group} onChange={e => setGroup(e.target.value)}
                  placeholder="e.g. Banking, IT, Pharma…"
                  list="wl-group-suggestions"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted/40 focus:outline-none focus:border-primary/60 transition"
                />
                <datalist id="wl-group-suggestions">
                  {groupSuggestions.map(g => <option key={g} value={g} />)}
                </datalist>
                {!group && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {groupSuggestions.slice(0, 6).map(g => (
                      <button key={g} type="button" onClick={() => setGroup(g)}
                        className="px-2.5 py-1 bg-background border border-border hover:border-primary/50 text-textMuted hover:text-primary rounded-lg text-xs transition">
                        {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2 block">
                  Notes <span className="font-normal text-textMuted/50">(optional)</span>
                </label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Reason for adding, target price, strategy…"
                  rows={2}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted/40 focus:outline-none focus:border-primary/60 transition resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pb-1">
                <button onClick={() => { setStep('search'); setSelected(null); setLiveQ(null) }}
                  className="px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-textMuted hover:text-textPrimary transition">
                  ← Back
                </button>
                <button onClick={onClose}
                  className="px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-textMuted hover:text-textPrimary transition">
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={adding || alreadyInWL}
                  className={clsx(
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2',
                    alreadyInWL
                      ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 cursor-default'
                      : 'bg-primary hover:bg-primary/90 disabled:opacity-50 text-white'
                  )}>
                  {adding && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {alreadyInWL ? '✓ Already in Watchlist' : adding ? 'Adding…' : `Add ${selected.scripName?.split(' ')[0]} to Watchlist`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
