import { Building2, ArrowRight, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, parseISO, isValid } from 'date-fns'

function formatMeetingDate(dateStr) {
  if (!dateStr) return '—'
  // Try ISO and various formats
  const d = parseISO(dateStr)
  if (isValid(d)) return format(d, 'd MMM')
  return dateStr.slice(0, 6) // fallback
}

function MeetingRow({ item }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-textPrimary truncate">{item.company || '—'}</p>
        {item.purpose && (
          <p className="text-xs text-textMuted truncate mt-0.5">{item.purpose}</p>
        )}
      </div>
      <span className="text-xs font-semibold text-amber-400 whitespace-nowrap flex-shrink-0 mt-0.5">
        {formatMeetingDate(item.date)}
      </span>
    </div>
  )
}

export default function BoardMeetingsWidget({ data, loading, error }) {
  const items = data?.items ?? []

  return (
    <div className="glass-panel rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-textPrimary">Upcoming Board Meetings</h2>
        </div>
        <Link to="/board-meetings" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition">
          View All <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3 flex-1">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex justify-between py-2 border-b border-border/30">
              <div className="space-y-1.5">
                <div className="h-3.5 w-28 skeleton rounded" />
                <div className="h-3 w-20 skeleton rounded" />
              </div>
              <div className="h-4 w-12 skeleton rounded" />
            </div>
          ))}
        </div>
      ) : error || items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          {error ? (
            <>
              <AlertCircle className="w-6 h-6 text-textMuted/30 mb-2" />
              <p className="text-sm text-textMuted">Unable to load board meetings</p>
            </>
          ) : (
            <p className="text-sm text-textMuted">No upcoming board meetings</p>
          )}
        </div>
      ) : (
        <div className="flex-1 space-y-0">
          {items.map((item, i) => (
            <MeetingRow key={item.bseCode || i} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
