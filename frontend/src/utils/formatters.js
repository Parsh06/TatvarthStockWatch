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
  if (!category) return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-surface dark:text-textMuted dark:border-border border'
  const cat = category.toLowerCase()
  if (cat.includes('result') || cat.includes('financial')) return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700 border'
  if (cat.includes('dividend')) return 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-400 dark:border-sky-700 border'
  if (cat.includes('agm') || cat.includes('meeting')) return 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-400 dark:border-violet-700 border'
  if (cat.includes('merger') || cat.includes('acquisition')) return 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700 border'
  if (cat.includes('bonus') || cat.includes('split')) return 'bg-pink-50 text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-400 dark:border-pink-700 border'
  if (cat.includes('rights')) return 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-700 border'
  if (cat.includes('insider') || cat.includes('trading')) return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700 border'
  return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-surface dark:text-textMuted dark:border-border border'
}

export function getExchangeColor(exchange) {
  if (!exchange) return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-surface dark:text-textMuted border'
  const ex = exchange.toUpperCase()
  if (ex === 'BSE') return 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700 border'
  if (ex === 'NSE') return 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-700 border'
  if (ex === 'BOTH') return 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-400 dark:border-purple-700 border'
  return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-surface dark:text-textMuted dark:border-border border'
}

export function truncate(str, maxLen = 100) {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}
