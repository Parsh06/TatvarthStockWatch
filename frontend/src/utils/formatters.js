import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'

// ── Shared number/currency formatters ─────────────────────────────────────────

export function fmtN(v, dec = 2) {
  if (v == null) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function fmtInr(v, compact = true) {
  if (v == null) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  const abs  = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (compact) {
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
  }
  return `${sign}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtPct(v) {
  if (v == null) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function fmtCr(v) {
  if (v == null) return null
  const n = parseFloat(v)
  if (isNaN(n)) return null
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  return `₹${n.toFixed(2)}`
}

export function fmtChange(change, pct) {
  if (change == null || pct == null) return null
  const sign = change >= 0 ? '+' : ''
  return `${sign}${fmtN(change)} (${sign}${fmtN(pct)}%)`
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr)
    if (!isValid(date)) return '—'
    return format(date, 'd MMM yyyy')
  } catch {
    return '—'
  }
}

export function formatRelativeDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr)
    if (!isValid(date)) return '—'
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function getCategoryColor(category) {
  if (!category) return 'bg-surface text-textMuted border border-border'
  const cat = category.toLowerCase()
  if (cat.includes('result') || cat.includes('financial')) return 'bg-emerald-900/40 text-emerald-400 border border-emerald-700'
  if (cat.includes('dividend')) return 'bg-sky-900/40 text-sky-400 border border-sky-700'
  if (cat.includes('agm') || cat.includes('meeting')) return 'bg-violet-900/40 text-violet-400 border border-violet-700'
  if (cat.includes('merger') || cat.includes('acquisition')) return 'bg-amber-900/40 text-amber-400 border border-amber-700'
  if (cat.includes('bonus') || cat.includes('split')) return 'bg-pink-900/40 text-pink-400 border border-pink-700'
  if (cat.includes('rights')) return 'bg-orange-900/40 text-orange-400 border border-orange-700'
  if (cat.includes('insider') || cat.includes('trading')) return 'bg-red-900/40 text-red-400 border border-red-700'
  return 'bg-surface text-textMuted border border-border'
}

export function getExchangeColor(exchange) {
  if (!exchange) return 'bg-surface text-textMuted'
  const ex = exchange.toUpperCase()
  if (ex === 'BSE') return 'bg-blue-900/40 text-blue-400 border border-blue-700'
  if (ex === 'NSE') return 'bg-orange-900/40 text-orange-400 border border-orange-700'
  if (ex === 'BOTH') return 'bg-purple-900/40 text-purple-400 border border-purple-700'
  return 'bg-surface text-textMuted border border-border'
}

export function truncate(str, maxLen = 100) {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}
