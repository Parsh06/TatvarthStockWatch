import { useState, useEffect, useMemo, useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Search, X, CheckCircle2, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { getAnnouncementsFromDB } from '../../services/announcementService'

const today = new Date()

function monthRange(year, month) {
  const last = new Date(year, month + 1, 0).getDate()
  const p2 = (n) => String(n).padStart(2, '0')
  return { 
    from: `01/${p2(month + 1)}/${year}`, 
    to: `${p2(last)}/${p2(month + 1)}/${year}` 
  }
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function BoardMeetingsPage() {
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [search, setSearch] = useState('')
  
  const [meetings, setMeetings] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function prevMonth() { setMonth(m => { if (m === 0) { setYear(y => y - 1); return 11 } return m - 1 }) }
  function nextMonth() { setMonth(m => { if (m === 11) { setYear(y => y + 1); return 0 } return m + 1 }) }
  function goToday()   { setYear(today.getFullYear()); setMonth(today.getMonth()) }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { from, to } = monthRange(year, month)
      const url = `/api/bse/board-meetings?fromDT=${from}&ToDt=${to}`
      const data = await apiClient(url)
      
      const fetchedMeetings = data?.Corp_fetch_BoardMeeting_Table1 || []
      setMeetings(fetchedMeetings)

      // Only fetch today's announcements once per session to avoid spamming Firestore
      const cachedAnns = await getAnnouncementsFromDB({ limitCount: 2000 })
      setAnnouncements(cachedAnns)

    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  // Map announcements by script code for O(1) lookup
  const outcomeByScript = useMemo(() => {
    const map = {}
    for (const ann of announcements) {
      const cat = (ann.category || '').toLowerCase()
      if (
        cat.includes('outcome') || 
        cat.includes('result') || 
        cat.includes('board meeting')
      ) {
        const code = String(ann.scriptCode || ann.bseCode || ann.ltdCode || '').trim()
        if (code) {
          map[code] = true
        }
      }
    }
    return map
  }, [announcements])

  // Filter meetings by search
  const displayed = useMemo(() => {
    if (!search.trim()) return meetings
    const q = search.trim().toLowerCase()
    return meetings.filter(m => 
      (m.Long_Name || '').toLowerCase().includes(q) ||
      (m.scrip_code || '').toLowerCase().includes(q) ||
      (m.PURPOSE_NAME || '').toLowerCase().includes(q)
    )
  }, [meetings, search])

  // Map meetings by Date string (YYYY-MM-DD for matching with calendar grid)
  const dateMap = useMemo(() => {
    const map = {}
    for (const m of displayed) {
      // m.MEETING_DATE usually comes like "04 Jul 2026" or "4/7/2026"
      // Wait, let's parse m.MEETING_DATE properly.
      // Often, `m.MEETING_BOARD_DATE` is "7/4/2026 12:00:00 AM" (M/D/YYYY).
      const p2 = (n) => String(n).padStart(2, '0')
      let dateKey = ''
      if (m.MEETING_BOARD_DATE) {
        const [mdy] = m.MEETING_BOARD_DATE.split(' ')
        const [m_str, d_str, y_str] = mdy.split('/')
        if (y_str && m_str && d_str) {
          dateKey = `${y_str}-${p2(m_str)}-${p2(d_str)}`
        }
      } else if (m.MEETING_DATE) {
        const d = new Date(m.MEETING_DATE)
        if (!isNaN(d.getTime())) {
          dateKey = `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`
        }
      }
      
      if (dateKey) {
        if (!map[dateKey]) map[dateKey] = []
        map[dateKey].push(m)
      }
    }
    return map
  }, [displayed])

  // Generate calendar days
  const calDays = useMemo(() => {
    const first = new Date(year, month, 1).getDay()
    const last  = new Date(year, month + 1, 0).getDate()
    const days  = Array(first).fill(null)
    for (let d = 1; d <= last; d++) days.push(d)
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [year, month])

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const p2 = (n) => String(n).padStart(2, '0')

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Board Meeting Calendar
          </h1>
          <p className="text-textMuted mt-1">
            Track scheduled board meetings and verify if their results have been published today.
          </p>
        </div>
        
        <button 
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surfaceHover border border-border rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border rounded-xl p-4">
        {/* Month nav */}
        <div className="flex items-center gap-1 bg-background border border-border rounded-xl px-3 py-2">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-white/5 text-textMuted hover:text-textPrimary transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-textPrimary w-36 text-center">{monthLabel(year, month)}</span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-white/5 text-textMuted hover:text-textPrimary transition">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="ml-1.5 px-2 py-0.5 text-xs bg-primary/10 text-primary border border-primary/25 rounded-md hover:bg-primary/20 transition"
          >
            Today
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input 
            type="text" 
            placeholder="Search company, code, or purpose..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-xl pl-9 pr-8 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-background/50 border-b border-border">
          {DAY_HEADERS.map(d => (
            <div key={d} className="py-3 text-center text-xs font-semibold text-textMuted uppercase tracking-wider">{d}</div>
          ))}
        </div>

        {/* Loading overlay logic */}
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          
          {/* Weeks */}
          <div className="grid grid-cols-7 bg-surface">
            {calDays.map((day, idx) => {
              if (!day) return (
                <div key={idx} className="min-h-[140px] border-b border-r border-border/40 bg-background/30" />
              )
              const dateKey = `${year}-${p2(month + 1)}-${p2(day)}`
              const dayEvts = dateMap[dateKey] || []
              const isToday = dateKey === todayStr

              return (
                <div
                  key={idx}
                  className={clsx(
                    'min-h-[140px] p-2 border-b border-r border-border/40 transition-colors',
                    isToday ? 'bg-primary/[0.04]' : 'hover:bg-white/[0.02]'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={clsx(
                      'inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-medium',
                      isToday ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-textPrimary'
                    )}>
                      {day}
                    </span>
                    {dayEvts.length > 0 && (
                      <span className="text-[10px] font-semibold text-textMuted bg-background px-1.5 py-0.5 rounded-full border border-border">
                        {dayEvts.length}
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-1.5 overflow-y-auto max-h-[100px] scrollbar-hide">
                    {dayEvts.map((e, i) => {
                      const hasResult = !!outcomeByScript[e.scrip_code]
                      return (
                        <div
                          key={i}
                          title={`${e.Long_Name} — ${e.PURPOSE_NAME}`}
                          className={clsx(
                            'text-left text-xs leading-tight p-1.5 rounded-md border flex flex-col gap-1 transition-all group relative',
                            hasResult 
                              ? 'bg-green-500/10 border-green-500/20 hover:border-green-500/40' 
                              : 'bg-background border-border hover:border-textMuted/40'
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-medium truncate text-textPrimary">{e.scrip_code}</span>
                            {hasResult ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-red-400 mt-1 flex-shrink-0" title="Result Pending" />
                            )}
                          </div>
                          <span className="truncate text-[10px] text-textMuted group-hover:text-textPrimary transition-colors">
                            {e.Long_Name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
