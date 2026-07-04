import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, Download, CheckCircle2, XCircle, Calendar, FileText } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { getAnnouncementsFromDB } from '../../services/announcementService'
import { exportToXLSX } from '../../utils/csvParser'

const today = () => new Date().toISOString().slice(0, 10)

function StatCard({ label, value, sub, color = 'text-textPrimary', icon: Icon, iconColor }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      {Icon && (
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', iconColor || 'bg-primary/10')}>
          <Icon className="w-5 h-5 text-primary" />
        </div>
      )}
      <div>
        <p className="text-xs text-textMuted mb-0.5">{label}</p>
        <p className={clsx('text-xl font-bold tabular-nums', color)}>{value}</p>
        {sub && <p className="text-xs text-textMuted">{sub}</p>}
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch Board Meetings & Today's Announcements
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Format dates from YYYY-MM-DD to DD/MM/YYYY
      const formatApiDate = (d) => {
        const [y, m, day] = d.split('-')
        return `${day}/${m}/${y}`
      }

      // 2. Fetch Board Meetings
      const url = `/api/bse/board-meetings?fromDT=${formatApiDate(fromDate)}&ToDt=${formatApiDate(toDate)}`
      const data = await apiClient(url)
      const fetchedMeetings = data?.Corp_fetch_BoardMeeting_Table1 || []
      setMeetings(fetchedMeetings)

      // 3. Fetch today's announcements from Firestore to check results status
      const cachedAnns = await getAnnouncementsFromDB({ limitCount: 2000 })
      setAnnouncements(cachedAnns)

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
      'Result Out': outcomeByScript[m.scrip_code] ? 'Yes' : 'No'
    }))
    exportToXLSX(exportData, `Board_Meetings_${fromDate}_to_${toDate}`)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
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
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-surface hover:bg-surfaceHover border border-border rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
          <button 
            onClick={handleExport}
            disabled={!filteredMeetings.length}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">From Date</label>
          <input 
            type="date" 
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">To Date</label>
          <input 
            type="date" 
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
            <input 
              type="text" 
              placeholder="Search company, code, or purpose..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow"
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
      <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-background border-b border-border text-xs uppercase tracking-wider text-textMuted sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium">BSE Code</th>
                <th className="px-4 py-3 font-medium">Company Name</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Meeting Date</th>
                <th className="px-4 py-3 font-medium text-center">Result Out?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-4 py-12 text-center text-textMuted">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                    <p>Loading board meetings...</p>
                  </td>
                </tr>
              ) : filteredMeetings.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-12 text-center text-textMuted">
                    No board meetings found for this date range.
                  </td>
                </tr>
              ) : (
                filteredMeetings.map((m, idx) => {
                  const hasResult = !!outcomeByScript[m.scrip_code]
                  return (
                    <tr key={`${m.scrip_code}-${idx}`} className="hover:bg-surfaceHover transition-colors">
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
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
