import { Search, X } from 'lucide-react'
import clsx from 'clsx'

const EXCHANGES = ['BSE', 'NSE']

const CATEGORIES = [
  { value: 'Board Meeting',      color: 'blue'    },
  { value: 'Financial Results',  color: 'emerald' },
  { value: 'Dividend',           color: 'sky'     },
  { value: 'AGM/EGM',           color: 'violet'  },
  { value: 'Merger/Acquisition', color: 'amber'   },
  { value: 'Bonus/Split',        color: 'pink'    },
  { value: 'Rights Issue',       color: 'orange'  },
  { value: 'Insider Trading',    color: 'red'     },
  { value: 'Company Update',     color: 'indigo'  },
  { value: 'Other',              color: 'slate'   },
]

// base styles per color; data-[active] overrides applied via JS classname swap
const CHIP = {
  blue:    { base: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/15 dark:border-blue-500/40 dark:text-blue-400', active: 'bg-blue-600 border-blue-600 text-white shadow-sm' },
  emerald: { base: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-400', active: 'bg-emerald-600 border-emerald-600 text-white shadow-sm' },
  sky:     { base: 'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-500/15 dark:border-sky-500/40 dark:text-sky-400', active: 'bg-sky-600 border-sky-600 text-white shadow-sm' },
  violet:  { base: 'bg-violet-50 border-violet-200 text-violet-800 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-violet-400', active: 'bg-violet-600 border-violet-600 text-white shadow-sm' },
  amber:   { base: 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-400', active: 'bg-amber-500 border-amber-500 text-white shadow-sm' },
  pink:    { base: 'bg-pink-50 border-pink-200 text-pink-800 dark:bg-pink-500/15 dark:border-pink-500/40 dark:text-pink-400', active: 'bg-pink-600 border-pink-600 text-white shadow-sm' },
  orange:  { base: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-500/15 dark:border-orange-500/40 dark:text-orange-400', active: 'bg-orange-600 border-orange-600 text-white shadow-sm' },
  red:     { base: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-red-500/15 dark:border-red-500/40 dark:text-red-400', active: 'bg-rose-600 border-rose-600 text-white shadow-sm' },
  indigo:  { base: 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-500/15 dark:border-indigo-500/40 dark:text-indigo-400', active: 'bg-indigo-600 border-indigo-600 text-white shadow-sm' },
  slate:   { base: 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-500/15 dark:border-slate-500/40 dark:text-slate-400', active: 'bg-slate-700 border-slate-700 text-white shadow-sm' },
}

export default function AnnouncementFilters({ filters, onChange, categoryCounts = {} }) {
  function update(key) {
    return (e) => onChange({ ...filters, [key]: e.target.value })
  }
  function toggleCategory(val) {
    onChange({ ...filters, category: filters.category === val ? '' : val })
  }
  function toggleExchange(val) {
    onChange({ ...filters, exchange: filters.exchange === val ? '' : val })
  }
  function clearAll() {
    onChange({ exchange: '', category: '', fromDate: '', toDate: '', search: '' })
  }

  const hasFilters = filters.exchange || filters.category || filters.search

  return (
    <div className="space-y-3">
      {/* Row 1: search + exchange pills + clear */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input
            type="text"
            value={filters.search}
            onChange={update('search')}
            placeholder="Search company, code, subject…"
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2 sm:py-2.5 text-textPrimary placeholder-textMuted/50 focus:outline-none focus:ring-1 focus:ring-primary/50 shadow-sm text-sm transition-all"
          />
        </div>

        {/* Exchange toggle pills */}
        <div className="flex items-center bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border rounded-xl p-1 h-[40px] sm:h-[42px] shadow-sm">
          <button
            onClick={() => onChange({ ...filters, exchange: 'BSE' })}
            className={clsx(
              "flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all h-full",
              filters.exchange === 'BSE' ? "bg-white dark:bg-primary/20 text-primary shadow-sm font-semibold" : "text-textMuted hover:text-textPrimary"
            )}
          >
            BSE
          </button>
          <button
            onClick={() => onChange({ ...filters, exchange: 'NSE' })}
            className={clsx(
              "flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all h-full",
              filters.exchange === 'NSE' ? "bg-white dark:bg-primary/20 text-primary shadow-sm font-semibold" : "text-textMuted hover:text-textPrimary"
            )}
          >
            NSE
          </button>
          <button
            onClick={() => onChange({ ...filters, exchange: '' })}
            className={clsx(
              "flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all h-full",
              !filters.exchange ? "bg-white dark:bg-primary/20 text-primary shadow-sm font-semibold" : "text-textMuted hover:text-textPrimary"
            )}
          >
            BOTH
          </button>
        </div>

        {hasFilters && (
          <button onClick={clearAll}
            className="flex items-center gap-1.5 px-4 py-2.5 text-textMuted hover:text-textPrimary border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-textMuted/50 rounded-xl text-sm transition font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-black/20 dark:hover:bg-black/40 shadow-sm">
            <X className="w-4 h-4" /> Clear all
          </button>
        )}
      </div>

      {/* Row 2: category chips */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(({ value, color }) => {
          const count    = categoryCounts[value] || 0
          const isActive = filters.category === value
          const c        = CHIP[color]
          return (
            <button
              key={value}
              onClick={() => toggleCategory(value)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition',
                isActive ? c.active : c.base,
                count === 0 && !isActive && 'opacity-40'
              )}
            >
              {value}
              {count > 0 && (
                <span className={clsx(
                  'min-w-[18px] px-1 py-0.5 rounded-full text-[10px] font-bold text-center',
                  isActive ? 'bg-white/25 text-white' : 'bg-black/15'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
