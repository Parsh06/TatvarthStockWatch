import { useState, useMemo } from 'react'
import { useWatchlist as useWatchlistContext } from '../contexts/WatchlistContext'

// Tokenize query into words; score a script against all tokens
function scoreMatch(s, query) {
  if (!query) return 1
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return 1

  const name   = (s.scriptName || '').toLowerCase()
  const ltd    = (s.ltdCode    || '').toLowerCase()
  const symbol = (s.symbol     || '').toLowerCase()
  const notes  = (s.notes      || '').toLowerCase()

  let score = 0
  for (const tok of tokens) {
    // Exact start-of-word match (highest)
    if (name.startsWith(tok) || symbol === tok || ltd === tok)       { score += 10; continue }
    // Word boundary match inside name
    if (name.split(/\s+/).some((w) => w.startsWith(tok)))           { score += 7;  continue }
    // Symbol / ltdCode starts-with
    if (symbol.startsWith(tok) || ltd.startsWith(tok))               { score += 6;  continue }
    // Substring match in name or symbol
    if (name.includes(tok) || symbol.includes(tok) || ltd.includes(tok)) { score += 3; continue }
    // Notes / fallback
    if (notes.includes(tok))                                          { score += 1;  continue }
    // Token not found at all — disqualify
    return 0
  }
  return score
}

export function useWatchlist(filterOptions = {}) {
  const context = useWatchlistContext()
  const { search = '', exchange = '' } = filterOptions

  const filtered = useMemo(() => {
    const q = search.trim()
    return context.watchlist
      .map((s) => ({ s, score: scoreMatch(s, q) }))
      .filter(({ score, s }) => {
        if (score === 0) return false
        if (exchange && s.exchange?.toUpperCase() !== exchange.toUpperCase()) return false
        return true
      })
      .sort((a, b) => b.score - a.score)
      .map(({ s }) => s)
  }, [context.watchlist, search, exchange])

  return { ...context, filtered }
}
