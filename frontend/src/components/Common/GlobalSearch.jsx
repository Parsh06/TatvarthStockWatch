/**
 * GlobalSearch — Ctrl+K / Cmd+K modal.
 * Searches: watchlist, portfolio (from localStorage), BSE live search.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Briefcase, Star, Building2, Clock, CornerDownLeft } from 'lucide-react'
import clsx from 'clsx'
import { useWatchlist } from '../../contexts/WatchlistContext'

const BACKEND    = import.meta.env.VITE_BACKEND_URL || ''
const LS_KEY     = 'portfolio_holdings_v2'
const RECENT_KEY = 'global_search_recent_v1'

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

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.slice(0, 5) : []
  } catch { return [] }
}

function saveRecent(entry) {
  try {
    const existing = loadRecent().filter((r) => r.key !== entry.key)
    const next = [entry, ...existing].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* ignore quota/serialization errors */ }
}

// Bolds the matched substring — built with slicing, not innerHTML, since names come from an API.
function HighlightMatch({ text, query }) {
  if (!query || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

function ResultRow({ item, active, query, onPick, onHover }) {
  return (
    <button
      role="option"
      aria-selected={active}
      data-index={item.index}
      onMouseEnter={onHover}
      onMouseDown={onPick}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-100',
        active ? 'bg-primary/10' : 'hover:bg-white/5'
      )}
    >
      <item.icon className={clsx('w-4 h-4 flex-shrink-0', item.iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-textPrimary font-medium truncate">
          <HighlightMatch text={item.title} query={query} />
        </p>
        <p className="text-xs text-textMuted truncate">{item.subtitle}</p>
      </div>
      {item.trailing && <span className="text-xs font-mono text-primary flex-shrink-0">{item.trailing}</span>}
      {active && <CornerDownLeft className="w-3.5 h-3.5 text-primary/60 flex-shrink-0 hidden sm:block" />}
    </button>
  )
}

export default function GlobalSearch({ open, onClose }) {
  const navigate       = useNavigate()
  const { watchlist }  = useWatchlist()
  const [query, setQuery]     = useState('')
  const [bseResults, setBse]  = useState([])
  const [bseLoading, setBseL] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recent, setRecent]   = useState([])
  const inputRef  = useRef(null)
  const listRef   = useRef(null)
  const dq        = useDebounce(query, 300)

  const portfolioHoldings = useMemo(() => loadPortfolioNames(), [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setBse([])
      setActiveIndex(0)
      setRecent(loadRecent())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Lock body scroll while the palette is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // BSE live search
  useEffect(() => {
    if (!dq || dq.length < 2) { setBse([]); return }
    const controller = new AbortController()
    setBseL(true)
    fetch(`${BACKEND}/api/bse/search?q=${encodeURIComponent(dq)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => setBse(Array.isArray(d) ? d.slice(0, 6) : []))
      .catch((err) => { if (err.name !== 'AbortError') setBse([]) })
      .finally(() => setBseL(false))
    return () => controller.abort()
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

  function navigate2(path, state, recentEntry) {
    if (recentEntry) saveRecent(recentEntry)
    navigate(path, { state })
    onClose()
  }

  // Flatten every visible result into one ordered list so arrow keys can move across sections
  const flatResults = useMemo(() => {
    const items = []
    let i = 0
    watchlistMatches.forEach((s) => items.push({
      index: i++, icon: Star, iconClass: 'text-warning fill-warning',
      title: s.scriptName, subtitle: s.bseCode || s.ltdCode,
      onPick: () => navigate2('/company-data',
        { script: { bseCode: s.bseCode || s.ltdCode, scripName: s.scriptName, symbol: s.nseSymbol || '' } },
        { key: `wl-${s.bseCode || s.ltdCode}`, label: s.scriptName, path: '/company-data',
          state: { script: { bseCode: s.bseCode || s.ltdCode, scripName: s.scriptName, symbol: s.nseSymbol || '' } } }),
    }))
    portfolioMatches.forEach((h) => items.push({
      index: i++, icon: Briefcase, iconClass: 'text-primary',
      title: h.scripName, subtitle: `BSE ${h.bseCode}`,
      onPick: () => navigate2('/portfolio', undefined,
        { key: `pf-${h.bseCode}`, label: h.scripName, path: '/portfolio' }),
    }))
    bseResults.forEach((item) => items.push({
      index: i++, icon: Building2, iconClass: 'text-textMuted',
      title: item.scripName, subtitle: `${item.symbol} · ${item.isin}`, trailing: item.bseCode,
      onPick: () => navigate2('/company-data',
        { script: { bseCode: item.bseCode, scripName: item.scripName, symbol: item.symbol || '', isin: item.isin || '' } },
        { key: `bse-${item.bseCode}`, label: item.scripName, path: '/company-data',
          state: { script: { bseCode: item.bseCode, scripName: item.scripName, symbol: item.symbol || '', isin: item.isin || '' } } }),
    }))
    return items
  }, [watchlistMatches, portfolioMatches, bseResults])

  useEffect(() => { setActiveIndex(0) }, [dq])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (flatResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % flatResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? flatResults.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flatResults[activeIndex]?.onPick()
    }
  }

  if (!open) return null

  const showEmptyQueryState = !query
  const hasAnyResults = flatResults.length > 0
  const showNoResults = query && !bseLoading && !hasAnyResults

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-4 sm:pt-[10vh] px-3 sm:px-4 bg-black/70 backdrop-blur-sm"
      style={{ animation: 'tswSearchBackdrop 0.15s ease-out' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @keyframes tswSearchBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tswSearchPanel {
          from { opacity: 0; transform: translateY(-10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        style={{ animation: 'tswSearchPanel 0.18s cubic-bezier(0.16,1,0.3,1)' }}
        className="bg-surface border border-border rounded-xl sm:rounded-2xl shadow-2xl shadow-black/40
                   w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[75vh]"
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <Search className="w-5 h-5 text-textMuted flex-shrink-0" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={hasAnyResults}
            aria-controls="global-search-listbox"
            aria-activedescendant={hasAnyResults ? `gs-opt-${activeIndex}` : undefined}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search watchlist, portfolio, or any BSE company…"
            className="flex-1 min-w-0 bg-transparent text-textPrimary text-sm placeholder-textMuted/50 focus:outline-none"
          />
          {bseLoading && <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          <button
            onClick={onClose}
            aria-label="Close search"
            className="text-textMuted hover:text-textPrimary p-1 -mr-1 rounded-md hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div id="global-search-listbox" role="listbox" ref={listRef} className="overflow-y-auto flex-1">
          {showEmptyQueryState && (
            <div>
              {recent.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider px-4 py-2 bg-background/40">Recent</p>
                  {recent.map((r) => (
                    <button
                      key={r.key}
                      onMouseDown={() => navigate2(r.path, r.state, r)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                    >
                      <Clock className="w-4 h-4 text-textMuted flex-shrink-0" />
                      <span className="text-sm text-textPrimary truncate">{r.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {watchlist.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider px-4 py-2 bg-background/40">Your Watchlist</p>
                  {watchlist.slice(0, 4).map((s) => (
                    <button
                      key={s.id || s.bseCode}
                      onMouseDown={() => navigate2('/company-data',
                        { script: { bseCode: s.bseCode || s.ltdCode, scripName: s.scriptName, symbol: s.nseSymbol || '' } },
                        { key: `wl-${s.bseCode || s.ltdCode}`, label: s.scriptName, path: '/company-data',
                          state: { script: { bseCode: s.bseCode || s.ltdCode, scripName: s.scriptName, symbol: s.nseSymbol || '' } } })}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                    >
                      <Star className="w-4 h-4 text-warning fill-warning flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-textPrimary font-medium truncate">{s.scriptName}</p>
                        <p className="text-xs text-textMuted">{s.bseCode || s.ltdCode}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {recent.length === 0 && watchlist.length === 0 && (
                <p className="text-xs text-center text-textMuted/40 py-10 px-4">
                  Start typing to search your watchlist, portfolio, or any BSE-listed company
                </p>
              )}
            </div>
          )}

          {watchlistMatches.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider px-4 py-2 bg-background/40">Watchlist</p>
              {flatResults.filter((_, idx) => idx < watchlistMatches.length).map((item) => (
                <ResultRow
                  key={`wl-${item.index}`}
                  item={item}
                  query={query}
                  active={item.index === activeIndex}
                  onHover={() => setActiveIndex(item.index)}
                  onPick={item.onPick}
                />
              ))}
            </div>
          )}

          {portfolioMatches.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider px-4 py-2 bg-background/40">Portfolio</p>
              {flatResults
                .filter((item) => item.index >= watchlistMatches.length && item.index < watchlistMatches.length + portfolioMatches.length)
                .map((item) => (
                  <ResultRow
                    key={`pf-${item.index}`}
                    item={item}
                    query={query}
                    active={item.index === activeIndex}
                    onHover={() => setActiveIndex(item.index)}
                    onPick={item.onPick}
                  />
                ))}
            </div>
          )}

          {bseResults.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-textMuted uppercase tracking-wider px-4 py-2 bg-background/40">BSE Companies</p>
              {flatResults
                .filter((item) => item.index >= watchlistMatches.length + portfolioMatches.length)
                .map((item) => (
                  <ResultRow
                    key={`bse-${item.index}`}
                    item={item}
                    query={query}
                    active={item.index === activeIndex}
                    onHover={() => setActiveIndex(item.index)}
                    onPick={item.onPick}
                  />
                ))}
            </div>
          )}

          {showNoResults && (
            <p className="text-xs text-center text-textMuted/40 py-10 px-4">No results for "{query}"</p>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border/50 flex gap-4 text-[10px] text-textMuted/40 flex-shrink-0">
          <span className="hidden sm:inline">↑↓ Navigate · ↵ Open · Esc Close</span>
          <span className="sm:hidden">↵ Open · Esc Close</span>
          <span className="ml-auto hidden sm:inline">Ctrl+K to open anytime</span>
        </div>
      </div>
    </div>
  )
}