/**
 * Reusable BSE script search dropdown.
 * Calls /api/bse/search, shows autocomplete suggestions.
 * Props:
 *   placeholder  — input placeholder text
 *   onSelect(item|null) — called when user picks a result or clears
 *   onClear()    — called when input is cleared
 *   className    — extra classes on the wrapper div
 */
import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
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

export default function ScriptSearchInput({ placeholder = 'Search company…', onSelect, onClear, className }) {
  const [query, setQuery]           = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen]             = useState(false)
  const [loading, setLoading]       = useState(false)
  const [selected, setSelected]     = useState(null)
  const debouncedQ = useDebounce(query, 350)
  const wrapRef = useRef(null)

  // Fetch suggestions
  useEffect(() => {
    if (!debouncedQ || debouncedQ.length < 2 || selected) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`${BACKEND_URL}/api/bse/search?q=${encodeURIComponent(debouncedQ)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setSuggestions(Array.isArray(data) ? data.slice(0, 10) : [])
          setOpen(true)
        }
      })
      .catch(() => { if (!cancelled) setSuggestions([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQ])

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function pick(item) {
    setSelected(item)
    setQuery(`${item.scripName} (${item.bseCode})`)
    setSuggestions([])
    setOpen(false)
    onSelect?.(item)
  }

  function clear() {
    setSelected(null)
    setQuery('')
    setSuggestions([])
    setOpen(false)
    onSelect?.(null)
    onClear?.()
  }

  return (
    <div ref={wrapRef} className={clsx('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 bg-background border border-border rounded-lg text-sm text-textPrimary placeholder-textMuted focus:outline-none focus:border-primary/60"
        />
        {query && (
          <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (suggestions.length > 0 || loading) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
          {loading && (
            <div className="px-4 py-3 text-xs text-textMuted animate-pulse">Searching…</div>
          )}
          {suggestions.map((item) => (
            <button
              key={`${item.bseCode}-${item.type}`}
              onMouseDown={() => pick(item)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 text-left gap-3 transition"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-textPrimary truncate">{item.scripName}</p>
                <p className="text-xs text-textMuted">{item.symbol} · {item.isin}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xs font-mono text-primary">{item.bseCode}</p>
                <p className="text-xs text-textMuted opacity-60">{item.type?.replace('in Equity ', '')}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
