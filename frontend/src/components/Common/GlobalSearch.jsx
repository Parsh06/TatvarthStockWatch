/**
 * GlobalSearch — Ctrl+K / Cmd+K modal.
 * Searches: watchlist, portfolio (from localStorage), BSE live search.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Briefcase, Star, Building2 } from 'lucide-react'
import clsx from 'clsx'
import { useWatchlist } from '../../contexts/WatchlistContext'

const BACKEND = import.meta.env.VITE_BACKEND_URL || ''
const LS_KEY  = 'portfolio_holdings_v2'

function useDebounce(v, d) {
  const [dv, setDv] = useState(v)
  useEffect(() => { const t = setTimeout(() => setDv(v), d); return () => clearTimeout(t) }, [v, d])
  return dv
}

function loadPortfolioNames() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const { holdings } = JSON.parse(raw)
    return Array.isArray(holdings) ? holdings : []
  } catch { return [] }
}

export default function GlobalSearch({ open, onClose }) {
  const navigate    = useNavigate()
  const { watchlist } = useWatchlist()
  const [query, setQuery]       = useState('')
  const [bseResults, setBse]    = useState([])
  const [bseLoading, setBseL]   = useState(false)
  const inputRef                = useRef(null)
  const dq                      = useDebounce(query, 300)

  const portfolioHoldings = useMemo(() => loadPortfolioNames(), [open])

  useEffect(() => {
    if (open) { setQuery(''); setBse([]); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  // BSE live search
  useEffect(() => {
    if (!dq || dq.length < 2) { setBse([]); return }
    let cancelled = false
    setBseL(true)
    fetch(`${BACKEND}/api/bse/search?q=${encodeURIComponent(dq)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setBse(Array.isArray(d) ? d.slice(0, 6) : []) })
      .catch(() => { if (!cancelled) setBse([]) })
      .finally(() => { if (!cancelled) setBseL(false) })
    return () => { cancelled = true }
  }, [dq])

  const q = query.toLowerCase()

  const watchlistMatches = useMemo(() =>
    q.length < 1 ? [] : watchlist.filter(s =>
      (s.scriptName || s.bseCode || '').toLowerCase().includes(q) ||
      (s.bseCode || '').toLowerCase().includes(q) ||
      (s.nseSymbol || '').toLowerCase().includes(q)
    ).slice(0, 4),
    [q, watchlist]
  )

  const portfolioMatches = useMemo(() =>
    q.length < 1 ? [] : portfolioHoldings.filter(h =>
      (h.scripName || '').toLowerCase().includes(q) ||
      (h.bseCode || '').toLowerCase().includes(q)
    ).slice(0, 4),
    [q, portfolioHoldings]
  )

  function navigate2(path, state) {
    navigate(path, { state })
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-black/70 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-textMuted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onClose()}
            placeholder="Search watchlist, portfolio, or any BSE company…"
            className="flex-1 bg-transparent text-textPrimary text-sm placeholder-textMuted/50 focus:outline-none"
          />
          {bseLoading && <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          <button onClick={onClose} className="text-textMuted hover:text-textPrimary transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query && (
            <p className="text-xs text-center text-textMuted/40 py-8">Start typing to search…</p>
          )}

          {watchlistMatches.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider px-4 py-2 bg-background/40">Watchlist</p>
              {watchlistMatches.map(s => (
                <button key={s.id || s.bseCode}
                  onClick={() => navigate2('/company-data', { script: { bseCode: s.bseCode || s.ltdCode, scripName: s.scriptName, symbol: s.nseSymbol || '' } })}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition text-left">
                  <Star className="w-4 h-4 text-warning fill-warning flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-textPrimary font-medium truncate">{s.scriptName}</p>
                    <p className="text-xs text-textMuted">{s.bseCode || s.ltdCode}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {portfolioMatches.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider px-4 py-2 bg-background/40">Portfolio</p>
              {portfolioMatches.map(h => (
                <button key={h.bseCode}
                  onClick={() => navigate2('/portfolio')}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition text-left">
                  <Briefcase className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-textPrimary font-medium truncate">{h.scripName}</p>
                    <p className="text-xs text-textMuted">BSE {h.bseCode}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {bseResults.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider px-4 py-2 bg-background/40">BSE Companies</p>
              {bseResults.map(item => (
                <button key={`${item.bseCode}-${item.type}`}
                  onClick={() => navigate2('/company-data', { script: { bseCode: item.bseCode, scripName: item.scripName, symbol: item.symbol || '', isin: item.isin || '' } })}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition text-left">
                  <Building2 className="w-4 h-4 text-textMuted flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-textPrimary font-medium truncate">{item.scripName}</p>
                    <p className="text-xs text-textMuted">{item.symbol} · {item.isin}</p>
                  </div>
                  <span className="text-xs font-mono text-primary flex-shrink-0">{item.bseCode}</span>
                </button>
              ))}
            </div>
          )}

          {query && !bseLoading && !watchlistMatches.length && !portfolioMatches.length && !bseResults.length && (
            <p className="text-xs text-center text-textMuted/40 py-8">No results for "{query}"</p>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border/50 flex gap-4 text-[10px] text-textMuted/40">
          <span>↵ Open · Esc Close</span>
          <span className="ml-auto">Ctrl+K to open anytime</span>
        </div>
      </div>
    </div>
  )
}
