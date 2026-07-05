import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Command, X, ArrowRight, Activity, TrendingUp, Calendar, LayoutDashboard } from 'lucide-react'
import clsx from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import { searchBSEScripts } from '../../services/announcementService'

const QUICK_LINKS = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Watchlist', to: '/watchlist', icon: Activity },
  { label: 'Gainers & Losers', to: '/gainers-losers', icon: TrendingUp },
  { label: 'Corporate Calendar', to: '/calendar', icon: Calendar },
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    searchBSEScripts(debouncedQuery)
      .then(data => {
        setResults(data.slice(0, 5))
        setSelectedIndex(0)
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  const totalItems = !query.trim() ? QUICK_LINKS.length : results.length

  function handleSelect(index) {
    if (!query.trim()) {
      const link = QUICK_LINKS[index]
      if (link) {
        navigate(link.to)
        setOpen(false)
      }
    } else {
      const item = results[index]
      if (item) {
        navigate('/company-data', { state: { script: { bseCode: item.ltdCode || item.scripCode, scripName: item.scripName || item.scriptName, symbol: item.nseSymbol || item.symbol || '' } } })
        setOpen(false)
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1) % totalItems)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + totalItems) % totalItems)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(selectedIndex)
    }
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="relative w-full max-w-xl bg-surface/90 backdrop-blur-xl border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col"
        >
          {/* Search Input */}
          <div className="flex items-center px-4 py-4 border-b border-border gap-3">
            <Search className="w-5 h-5 text-textMuted" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none text-textPrimary placeholder:text-textMuted text-base sm:text-lg font-medium min-w-0"
              placeholder="Search scripts or jump to page..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="flex items-center gap-1">
              <kbd className="hidden sm:inline-flex items-center justify-center px-2 py-1 text-[10px] font-mono font-medium rounded border border-border bg-white/5 text-textMuted">ESC</kbd>
              <button onClick={() => setOpen(false)} className="sm:hidden p-1 text-textMuted hover:text-textPrimary bg-white/5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Results Area */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {!query.trim() ? (
              <div>
                <div className="px-3 py-2 text-xs font-semibold text-textMuted uppercase tracking-wider">Quick Links</div>
                {QUICK_LINKS.map((link, idx) => {
                  const Icon = link.icon
                  const active = idx === selectedIndex
                  return (
                    <button
                      key={link.to}
                      onClick={() => handleSelect(idx)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-sm text-left',
                        active ? 'bg-primary/10 text-primary font-medium' : 'text-textMuted hover:text-textPrimary hover:bg-white/5'
                      )}
                    >
                      <Icon className={clsx("w-4 h-4", active ? "text-primary" : "text-textMuted")} />
                      {link.label}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div>
                <div className="px-3 py-2 text-xs font-semibold text-textMuted uppercase tracking-wider flex items-center justify-between">
                  <span>Scripts</span>
                  {loading && <span className="text-[10px] lowercase normal-case text-textMuted/60 animate-pulse">searching...</span>}
                </div>
                {results.length > 0 ? (
                  results.map((item, idx) => {
                    const active = idx === selectedIndex
                    return (
                      <button
                        key={item.scripCode || item.ltdCode}
                        onClick={() => handleSelect(idx)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={clsx(
                          'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition text-sm text-left',
                          active ? 'bg-primary/10 border border-primary/20 shadow-sm' : 'border border-transparent hover:bg-white/5'
                        )}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className={clsx("font-semibold truncate", active ? "text-primary" : "text-textPrimary")}>{item.scripName || item.scriptName}</span>
                          <span className="text-xs text-textMuted font-mono mt-0.5 truncate">{item.scripCode || item.ltdCode} {item.nseSymbol ? `· ${item.nseSymbol}` : ''}</span>
                        </div>
                        <ArrowRight className={clsx("w-4 h-4 shrink-0 transition-transform", active ? "text-primary translate-x-1" : "text-transparent")} />
                      </button>
                    )
                  })
                ) : (
                  !loading && query.trim() && (
                    <div className="px-3 py-8 text-center text-textMuted text-sm">
                      No scripts found for "{query}"
                    </div>
                  )
                )}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="hidden sm:flex items-center justify-between px-4 py-2.5 bg-black/20 border-t border-border text-[10px] text-textMuted">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className="font-mono bg-white/5 border border-border px-1.5 py-0.5 rounded">↑</kbd><kbd className="font-mono bg-white/5 border border-border px-1.5 py-0.5 rounded">↓</kbd> to navigate</span>
              <span className="flex items-center gap-1"><kbd className="font-mono bg-white/5 border border-border px-1.5 py-0.5 rounded">ENTER</kbd> to select</span>
            </div>
            <span>Powered by Tatvarth Search</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
