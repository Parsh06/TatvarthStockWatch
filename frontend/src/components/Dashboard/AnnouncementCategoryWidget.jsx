import { useNavigate } from 'react-router-dom'
import { Tag } from 'lucide-react'
import clsx from 'clsx'

const BAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500',
  'bg-orange-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500',
  'bg-teal-500', 'bg-pink-500',
]

export default function AnnouncementCategoryWidget({ data, loading, error }) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-6 space-y-3">
        <div className="h-4 w-40 skeleton rounded mb-4" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-28 skeleton rounded" />
              <div className="h-3 w-10 skeleton rounded" />
            </div>
            <div className="h-2 skeleton rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-textMuted text-sm">
        <Tag className="w-6 h-6 mx-auto mb-2 opacity-30" />
        No category data available
      </div>
    )
  }

  const max = data[0]?.count || 1

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <Tag className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-textPrimary">Announcement Categories</h2>
      </div>

      <div className="space-y-3">
        {data.map((cat, i) => (
          <button
            key={cat.name}
            onClick={() => navigate(`/all-announcements?category=${encodeURIComponent(cat.name)}`)}
            className="w-full text-left group"
            aria-label={`View ${cat.name} announcements`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-textPrimary group-hover:text-primary transition truncate max-w-[70%]">
                {cat.name}
              </span>
              <span className="text-xs font-bold text-textMuted tabular-nums ml-2">
                {cat.count.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="h-1.5 bg-background rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all duration-500', BAR_COLORS[i % BAR_COLORS.length])}
                style={{ width: `${Math.max((cat.count / max) * 100, 2)}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
