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
import { Search, X, Loader2 } from 'lucide-react'
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

// Splits text around the matched query so we can highlight it cleanly
function HighlightMatch({ text, query }) {
  if (!query || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-bold bg-primary/10 px-0.5 rounded">{text.slice(idx, idx + query.length)}</span>
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
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="relative group">
        <Search
          className={clsx(
            'absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors',
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
          className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-surface border border-border rounded-xl text-sm font-medium text-textPrimary
                     placeholder-textMuted/60 transition-all duration-150 shadow-sm
                     focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {loading ? (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
        ) : query ? (
          <button
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* Dropdown Menu - 100% Solid & Opaque */}
      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          ref={listRef}
          style={{ animation: 'tswDropdownIn 0.15s ease-out', backgroundColor: 'var(--bg-surface)' }}
          className="absolute z-50 top-full left-0 right-0 mt-2 bg-surface border border-border
                     rounded-2xl shadow-2xl shadow-black/60 overflow-hidden max-h-80 overflow-y-auto divide-y divide-border/40"
        >
          {loading && suggestions.length === 0 && (
            <div className="px-5 py-4 flex items-center gap-3 text-xs text-textMuted">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Searching companies…</span>
            </div>
          )}

          {errored && (
            <div className="px-5 py-4 text-xs text-textMuted">
              Unable to load search results right now. Please try again.
            </div>
          )}

          {!loading && !errored && suggestions.length === 0 && debouncedQ.length >= 2 && (
            <div className="px-5 py-4 text-xs text-textMuted">
              No matching companies found for <span className="text-textPrimary font-semibold">"{debouncedQ}"</span>
            </div>
          )}

          {suggestions.map((item, i) => (
            <button
              key={`${item.bseCode}-${item.type}-${i}`}
              id={`${listboxId}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={() => pick(item)}
              className={clsx(
                'w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-all duration-150',
                i === activeIndex ? 'bg-primary/15' : 'hover:bg-primary/8'
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-textPrimary truncate leading-tight">
                  <HighlightMatch text={item.scripName} query={debouncedQ} />
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-textMuted font-mono">
                  {item.symbol && <span className="font-semibold text-textPrimary/80">{item.symbol}</span>}
                  {item.symbol && item.isin && <span>·</span>}
                  {item.isin && <span className="opacity-80">{item.isin}</span>}
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                {item.type && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-textMuted">
                    {item.type.replace('in Equity ', '').trim()}
                  </span>
                )}
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                  {item.bseCode}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}