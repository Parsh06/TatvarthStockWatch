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
  { value: 'Other',              color: 'slate'   },
]

// base styles per color; data-[active] overrides applied via JS classname swap
const CHIP = {
  blue:    { base: 'bg-blue-500/15    border-blue-500/40    text-blue-400',    active: 'bg-blue-500    border-blue-500    text-white'    },
  emerald: { base: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400', active: 'bg-emerald-500 border-emerald-500 text-white'    },
  sky:     { base: 'bg-sky-500/15     border-sky-500/40     text-sky-400',     active: 'bg-sky-500     border-sky-500     text-white'    },
  violet:  { base: 'bg-violet-500/15  border-violet-500/40  text-violet-400',  active: 'bg-violet-500  border-violet-500  text-white'    },
  amber:   { base: 'bg-amber-500/15   border-amber-500/40   text-amber-400',   active: 'bg-amber-500   border-amber-500   text-white'    },
  pink:    { base: 'bg-pink-500/15    border-pink-500/40    text-pink-400',    active: 'bg-pink-500    border-pink-500    text-white'    },
  orange:  { base: 'bg-orange-500/15  border-orange-500/40  text-orange-400',  active: 'bg-orange-500  border-orange-500  text-white'    },
  red:     { base: 'bg-red-500/15     border-red-500/40     text-red-400',     active: 'bg-red-500     border-red-500     text-white'    },
  slate:   { base: 'bg-slate-500/15   border-slate-500/40   text-slate-400',   active: 'bg-slate-600   border-slate-600   text-white'    },
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

  const hasFilters = filters.exchange || filters.category || filters.fromDate || filters.toDate || filters.search

  return (
    <div className="space-y-3">
      {/* Row 1: search + exchange pills + date + clear */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input
            type="text"
            value={filters.search}
            onChange={update('search')}
            placeholder="Search company, code, subject…"
            className="w-full bg-black/20 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-textPrimary placeholder-textMuted/50 focus:outline-none focus:ring-1 focus:ring-primary/50 shadow-inner text-sm transition-all"
          />
        </div>

        {/* Exchange toggle pills */}
        <div className="flex items-center bg-black/20 border border-white/5 rounded-xl p-1 h-[42px] shadow-inner">
          <button
            onClick={() => onChange({ ...filters, exchange: 'BSE' })}
            className={clsx(
              "flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all h-full",
              filters.exchange === 'BSE' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
            )}
          >
            BSE
          </button>
          <button
            onClick={() => onChange({ ...filters, exchange: 'NSE' })}
            className={clsx(
              "flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all h-full",
              filters.exchange === 'NSE' ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
            )}
          >
            NSE
          </button>
          <button
            onClick={() => onChange({ ...filters, exchange: '' })}
            className={clsx(
              "flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all h-full",
              !filters.exchange ? "bg-primary/20 text-primary shadow-sm" : "text-textMuted hover:text-textPrimary"
            )}
          >
            BOTH
          </button>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input type="date" value={filters.fromDate} onChange={update('fromDate')}
            className="bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm shadow-inner cursor-pointer transition-all" />
          <span className="text-textMuted text-sm">–</span>
          <input type="date" value={filters.toDate} onChange={update('toDate')}
            className="bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm shadow-inner cursor-pointer transition-all" />
        </div>

        {hasFilters && (
          <button onClick={clearAll}
            className="flex items-center gap-1.5 px-4 py-2.5 text-textMuted hover:text-textPrimary border border-white/5 hover:border-textMuted/50 rounded-xl text-sm transition font-semibold bg-black/20 hover:bg-black/40 shadow-sm">
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
