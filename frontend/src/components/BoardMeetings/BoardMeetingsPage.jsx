import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, Download, CheckCircle2, XCircle, Calendar, FileText, Bell } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { getAnnouncementsFromDB } from '../../services/announcementService'
import { exportToXLSX } from '../../utils/csvParser'
import PageTransition from '../Common/PageTransition'

const today = () => new Date().toISOString().slice(0, 10)

function StatCard({ label, value, sub, color = 'text-textPrimary', icon: Icon, iconColor }) {
  return (
    <div className="glass-panel hover:-translate-y-1 hover:shadow-premium-hover transition-all duration-300 rounded-2xl p-5 flex items-center gap-4 group relative overflow-hidden">
      {/* Background soft glow hack */}
      <div className={clsx("absolute -top-10 -right-10 w-24 h-24 blur-3xl opacity-20 rounded-full transition-opacity group-hover:opacity-30", iconColor || 'bg-primary')} />
      
      {Icon && (
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner z-10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3', iconColor || 'bg-black/5 dark:bg-white/5')}>
          <Icon className="w-5 h-5 text-primary" />
        </div>
      )}
      <div className="z-10">
        <p className="text-[11px] font-medium tracking-tight text-textMuted mb-0.5 uppercase">{label}</p>
        <p className={clsx('text-2xl font-bold font-display tabular-nums tracking-tight', color)}>{value}</p>
        {sub && <p className="text-xs text-textMuted mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function BoardMeetingsPage() {
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(today())
  const [searchQuery, setSearchQuery] = useState('')
  
  const [meetings, setMeetings] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [emailLogs, setEmailLogs] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [updatingPrefs, setUpdatingPrefs] = useState(false)

  // Fetch Board Meetings & Today's Announcements & Preferences
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 0. Fetch user preferences
      apiClient('/api/prefs')
        .then(prefs => setIsSubscribed(!!prefs.boardMeetingUpdatesEnabled))
        .catch(err => console.error('Failed to fetch prefs', err))

      // 1. Format dates from YYYY-MM-DD to DD/MM/YYYY
      const formatApiDate = (d) => {
        const [y, m, day] = d.split('-')
        return `${day}/${m}/${y}`
      }

      // 2. Fetch Board Meetings
      const url = `/api/bse/board-meetings?fromDT=${formatApiDate(fromDate)}&ToDt=${formatApiDate(toDate)}`
      const data = await apiClient(url)
      const fetchedMeetings = (data?.Corp_fetch_BoardMeeting_Table1 || [])
        .filter(m => m.scrip_code && m.scrip_code !== '-')
      setMeetings(fetchedMeetings)

      // 3. Fetch today's announcements from Firestore to check results status
      const cachedAnns = await getAnnouncementsFromDB({ limitCount: 2000 })
      setAnnouncements(cachedAnns)

      // 4. Fetch email logs to see which ones got notified
      try {
        const logs = await apiClient('/api/bse/board-meetings/email-logs')
        setEmailLogs(logs || {})
      } catch (err) {
        console.error('Failed to fetch email logs', err)
      }

    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Fetch on mount and when dates change
  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate])

  // Map announcements by script code for O(1) lookup
  const outcomeByScript = useMemo(() => {
    const map = {}
    for (const ann of announcements) {
      const cat = (ann.category || '').toLowerCase()
      // We look for Outcome, Financial Results, or Board Meeting updates
      if (
        cat.includes('outcome') || 
        cat.includes('result') || 
        cat.includes('board meeting')
      ) {
        const code = String(ann.scriptCode || ann.bseCode || ann.ltdCode || '').trim()
        if (code) {
          map[code] = ann.pdfUrl || ann.sourceUrl || true
        }
      }
    }
    return map
  }, [announcements])

  // Filter meetings locally
  const filteredMeetings = useMemo(() => {
    if (!searchQuery) return meetings
    const q = searchQuery.toLowerCase()
    return meetings.filter(m => 
      (m.Long_Name || '').toLowerCase().includes(q) ||
      (m.scrip_code || '').toLowerCase().includes(q) ||
      (m.PURPOSE_NAME || '').toLowerCase().includes(q)
    )
  }, [meetings, searchQuery])

  // Export to Excel
  const handleExport = () => {
    if (!filteredMeetings.length) return
    const exportData = filteredMeetings.map(m => ({
      'BSE Code': m.scrip_code,
      'Company Name': m.Long_Name,
      'Purpose': m.PURPOSE_NAME,
      'Meeting Date': m.MEETING_DATE,
      'Industry': m.Industry_name,
      'Result Out': outcomeByScript[m.scrip_code] ? 'Yes' : 'No',
      'Email Sent': emailLogs[m.scrip_code] ? 'Yes' : 'No'
    }))
    exportToXLSX(exportData, `Board_Meetings_${fromDate}_to_${toDate}`)
  }

  const toggleSubscription = async () => {
    try {
      setUpdatingPrefs(true)
      const newVal = !isSubscribed
      await apiClient('/api/prefs', {
        method: 'PATCH',
        body: JSON.stringify({ boardMeetingUpdatesEnabled: newVal })
      })
      setIsSubscribed(newVal)
    } catch (err) {
      console.error(err)
      alert('Failed to update subscription preference.')
    } finally {
      setUpdatingPrefs(false)
    }
  }

  return (
    <PageTransition className="space-y-6">
      
      {/* Global Opt-In Alert */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-textPrimary">Send me Board Meeting Updates</h3>
            <p className="text-sm text-textMuted">Receive a global email notification for every board meeting outcome published today.</p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={isSubscribed}
            onChange={toggleSubscription}
            disabled={updatingPrefs}
          />
          <div className="w-11 h-6 bg-surface border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Board Meeting Updates</h1>
          <p className="text-textMuted mt-1">
            Track scheduled board meetings and verify published results.
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
          <button 
            onClick={handleExport}
            disabled={!filteredMeetings.length}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary rounded-xl text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-5 grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">From Date</label>
          <input 
            type="date" 
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-inner cursor-pointer"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">To Date</label>
          <input 
            type="date" 
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-inner cursor-pointer"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Search</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
            <input 
              type="text" 
              placeholder="Search company, code, or purpose..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-inner placeholder:text-textMuted/50"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Meetings" value={meetings.length} icon={Calendar} />
        <StatCard label="Filtered" value={filteredMeetings.length} icon={Search} />
        <StatCard label="Results Out" value={filteredMeetings.filter(m => outcomeByScript[m.scrip_code]).length} color="text-green-500" icon={CheckCircle2} />
        <StatCard label="Pending" value={filteredMeetings.filter(m => !outcomeByScript[m.scrip_code]).length} color="text-red-500" icon={XCircle} />
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto flex-1 scrollbar-hide">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/20 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-4 py-3 font-medium">BSE Code</th>
                <th className="px-4 py-3 font-medium">Company Name</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Meeting Date</th>
                <th className="px-4 py-3 font-medium text-center">Result Out?</th>
                <th className="px-4 py-3 font-medium text-center">Email Sent?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-16 text-center text-textMuted">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 opacity-50 text-primary" />
                    <p>Loading board meetings...</p>
                  </td>
                </tr>
              ) : filteredMeetings.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-16 text-center text-textMuted">
                    No board meetings found for this date range.
                  </td>
                </tr>
              ) : (
                filteredMeetings.map((m, idx) => {
                  const hasResult = !!outcomeByScript[m.scrip_code]
                  return (
                    <tr key={`${m.scrip_code}-${idx}`} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 font-medium">{m.scrip_code}</td>
                      <td className="px-4 py-3">
                        <a 
                          href={m.URL} 
                          target="_blank" 
                          rel="noreferrer"
                          className="hover:text-primary transition-colors flex items-center gap-1.5"
                        >
                          {m.Long_Name}
                        </a>
                        {m.Industry_name && (
                          <div className="text-xs text-textMuted mt-0.5">{m.Industry_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-textMuted whitespace-normal min-w-[200px]">
                        {m.PURPOSE_NAME}
                      </td>
                      <td className="px-4 py-3">{m.MEETING_DATE}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center items-center gap-2">
                          {hasResult ? (
                            <>
                              <div className="flex items-center gap-1.5 text-xs font-medium text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                                <CheckCircle2 className="w-4 h-4" /> Yes
                              </div>
                              {typeof outcomeByScript[m.scrip_code] === 'string' && (
                                <a 
                                  href={outcomeByScript[m.scrip_code]} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-primary hover:text-primary/80 transition-colors"
                                  title="View Result PDF"
                                >
                                  <FileText className="w-5 h-5" />
                                </a>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs font-medium text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                              <XCircle className="w-4 h-4" /> No
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center items-center gap-2">
                          {emailLogs[m.scrip_code] ? (
                            <div className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                              <CheckCircle2 className="w-4 h-4" /> Yes
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs font-medium text-textMuted bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                              <XCircle className="w-4 h-4" /> No
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </PageTransition>
  )
}
