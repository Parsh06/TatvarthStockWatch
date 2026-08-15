/**
 * Reusable BSE script search dropdown.
 * Calls /api/bse/search, shows autocomplete suggestions.
 * Props:
 *   placeholder  — input placeholder text
 *   onSelect(item|null) — called when user picks a result or clears
 *   onClear()    — called when input is cleared
 *   className    — extra classes on the wrapper div
 */
import { useState, useEffect, useRef, useId } from 'react'
import { Search, X, Loader2, TrendingUp } from 'lucide-react'
import clsx from 'clsx'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

function useDebounce(val, delay) {
  const [d, setD] = useState(val)
  useEffect(() => {
    const t = setTimeout(() => setD(val), delay)
    return () => clearTimeout(t)
  }, [val, delay])
  return d
}

// Splits text around the matched query so we can bold it without
// dangerouslySetInnerHTML (keeps this XSS-safe for API-provided strings).
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

export default function ScriptSearchInput({ placeholder = 'Search company…', onSelect, onClear, className }) {
  const [query, setQuery]             = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [errored, setErrored]         = useState(false)
  const [selected, setSelected]       = useState(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debouncedQ = useDebounce(query, 350)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const listboxId = useId()

  // Fetch suggestions
  useEffect(() => {
    if (!debouncedQ || debouncedQ.length < 2 || selected) {
      setSuggestions([])
      setErrored(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setErrored(false)
    fetch(`${BACKEND_URL}/api/bse/search?q=${encodeURIComponent(debouncedQ)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Search request failed')
        return r.json()
      })
      .then((data) => {
        setSuggestions(Array.isArray(data) ? data.slice(0, 10) : [])
        setActiveIndex(-1)
        setOpen(true)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setSuggestions([])
          setErrored(true)
          setOpen(true)
        }
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [debouncedQ])

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keep the keyboard-active row visible when navigating with arrow keys
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function pick(item) {
    setSelected(item)
    setQuery(`${item.scripName} (${item.bseCode})`)
    setSuggestions([])
    setOpen(false)
    setActiveIndex(-1)
    onSelect?.(item)
  }

  function clear() {
    setSelected(null)
    setQuery('')
    setSuggestions([])
    setOpen(false)
    setActiveIndex(-1)
    onSelect?.(null)
    onClear?.()
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault()
        pick(suggestions[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  const showDropdown = open && (loading || errored || suggestions.length > 0 || (debouncedQ.length >= 2 && !selected))

  return (
    <div ref={wrapRef} className={clsx('relative w-full', className)}>
      <style>{`
        @keyframes tswDropdownIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div className="relative group">
        <Search
          className={clsx(
            'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors',
            query ? 'text-primary' : 'text-textMuted'
          )}
        />
        <input
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2.5 bg-background border border-border rounded-lg text-sm text-textPrimary
                     placeholder-textMuted transition-all duration-150
                     focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        />
        {loading ? (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/70 animate-spin" />
        ) : query ? (
          <button
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-textMuted hover:text-textPrimary hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          ref={listRef}
          style={{ animation: 'tswDropdownIn 0.15s ease-out' }}
          className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-surface/95 backdrop-blur-md border border-border
                     rounded-xl shadow-2xl shadow-black/30 overflow-hidden max-h-72 overflow-y-auto"
        >
          {loading && suggestions.length === 0 && (
            <div className="px-4 py-4 flex items-center gap-2 text-xs text-textMuted">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/70" />
              Searching…
            </div>
          )}

          {errored && (
            <div className="px-4 py-4 text-xs text-textMuted">
              Couldn't reach search right now. Try again in a moment.
            </div>
          )}

          {!loading && !errored && suggestions.length === 0 && debouncedQ.length >= 2 && (
            <div className="px-4 py-4 text-xs text-textMuted">
              No matches for <span className="text-textPrimary">"{debouncedQ}"</span>
            </div>
          )}

          {suggestions.map((item, i) => (
            <button
              key={`${item.bseCode}-${item.type}`}
              id={`${listboxId}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={() => pick(item)}
              className={clsx(
                'w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3',
                'px-4 py-2.5 text-left transition-colors border-b border-border/50 last:border-b-0',
                i === activeIndex ? 'bg-primary/10' : 'hover:bg-white/5'
              )}
            >
              <div className="min-w-0 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-primary/50 shrink-0 hidden sm:block" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-textPrimary truncate">
                    <HighlightMatch text={item.scripName} query={debouncedQ} />
                  </p>
                  <p className="text-xs text-textMuted truncate">{item.symbol} · {item.isin}</p>
                </div>
              </div>
              <div className="flex-shrink-0 flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0 pl-5 sm:pl-0">
                <p className="text-xs font-mono text-primary">{item.bseCode}</p>
                {item.type && (
                  <span className="text-[10px] leading-tight px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80 sm:mt-0.5">
                    {item.type.replace('in Equity ', '')}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}