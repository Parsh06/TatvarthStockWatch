import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, CalendarDays, Plus, Trash2, RefreshCw, CheckCircle2,
  AlertCircle, Clock, ShieldCheck, Search, Filter, Sparkles
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { apiClient } from '../../services/apiClient'
import AdminStatCard from './AdminStatCard'

export default function MarketHolidaysTab({ canWrite }) {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [todayIST, setTodayIST] = useState('')
  const [nextHoliday, setNextHoliday] = useState(null)

  // Form state
  const [formDate, setFormDate] = useState('')
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // ALL | UPCOMING | PAST | TODAY

  const fetchHolidays = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true)
    try {
      const res = await apiClient('/api/admin/system/holidays')
      if (res?.success) {
        setHolidays(res.holidays || [])
        setTodayIST(res.todayIST || '')
        setNextHoliday(res.nextHoliday || null)
      }
    } catch (err) {
      toast.error('Failed to load market holidays: ' + (err.message || 'Network error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchHolidays(true)
  }, [fetchHolidays])

  const handleAddHoliday = async (e) => {
    e.preventDefault()
    if (!canWrite) {
      toast.error('Admin write entitlement required')
      return
    }
    if (!formDate || !/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      toast.error('Please enter a valid date in YYYY-MM-DD format')
      return
    }
    if (!formName.trim()) {
      toast.error('Please enter a holiday name')
      return
    }

    setSubmitting(true)
    try {
      const res = await apiClient('/api/admin/system/holidays', {
        method: 'POST',
        body: JSON.stringify({
          date: formDate.trim(),
          name: formName.trim(),
          description: formDesc.trim(),
          isClosed: true,
        }),
      })

      if (res?.success) {
        toast.success(res.message || 'Market holiday added successfully')
        setFormDate('')
        setFormName('')
        setFormDesc('')
        await fetchHolidays(true)
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save market holiday')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteHoliday = async (dateStr, name) => {
    if (!canWrite) {
      toast.error('Admin write entitlement required')
      return
    }
    if (!window.confirm(`Are you sure you want to remove ${name} (${dateStr}) from the market holidays calendar?`)) {
      return
    }

    try {
      const res = await apiClient(`/api/admin/system/holidays/${dateStr}`, {
        method: 'DELETE',
      })
      if (res?.success) {
        toast.success(`Removed ${name} (${dateStr})`)
        await fetchHolidays(true)
      }
    } catch (err) {
      toast.error(err.message || 'Failed to delete market holiday')
    }
  }

  const handleBootstrapCalendar = async () => {
    if (!canWrite) {
      toast.error('Admin write entitlement required')
      return
    }
    if (!window.confirm('Sync official statutory NSE & BSE calendar for 2026/2027?')) {
      return
    }

    setBootstrapping(true)
    try {
      const res = await apiClient('/api/admin/system/holidays/bootstrap', {
        method: 'POST',
      })
      if (res?.success) {
        toast.success(res.message || 'Official market calendar synchronized')
        await fetchHolidays(true)
      }
    } catch (err) {
      toast.error(err.message || 'Failed to synchronize official holidays')
    } finally {
      setBootstrapping(false)
    }
  }

  // Filtered holidays
  const filteredHolidays = useMemo(() => {
    return holidays.filter(h => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch = !q ||
        h.name.toLowerCase().includes(q) ||
        h.date.includes(q) ||
        (h.description && h.description.toLowerCase().includes(q))

      let matchesStatus = true
      if (statusFilter === 'UPCOMING') matchesStatus = h.status === 'upcoming'
      else if (statusFilter === 'TODAY') matchesStatus = h.status === 'today'
      else if (statusFilter === 'PAST') matchesStatus = h.status === 'past'

      return matchesSearch && matchesStatus
    })
  }, [holidays, searchQuery, statusFilter])

  // Relative format helper
  const formatDateDisplay = (dateStr) => {
    try {
      const d = new Date(dateStr + 'T12:00:00Z')
      return new Intl.DateTimeFormat('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(d)
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Top Stat Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdminStatCard
          label="Total Holidays"
          value={holidays.length}
          sub="Registered in trading calendar"
          icon={CalendarDays}
          color="text-primary"
          loading={loading}
        />
        <AdminStatCard
          label="Next Market Holiday"
          value={nextHoliday ? nextHoliday.name : 'None Scheduled'}
          sub={nextHoliday ? `${formatDateDisplay(nextHoliday.date)} (in ${nextHoliday.daysUntil} days)` : 'Market open regular schedule'}
          icon={Calendar}
          color="text-accentTeal"
          loading={loading}
        />
        <AdminStatCard
          label="Engine Status"
          value="Holiday Guard Active"
          sub="30m idle cadence automatically applied"
          icon={ShieldCheck}
          color="text-success"
          loading={loading}
        />
      </div>

      {/* ── Holiday Creator & Quick Actions ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Card */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Add Indian Market Holiday
              </h3>
              <p className="text-xs text-textMuted mt-0.5">
                The autonomous scraping loop idles on 30m cadence and skips FII/DII sync on trading holidays.
              </p>
            </div>
            <button
              onClick={handleBootstrapCalendar}
              disabled={bootstrapping || !canWrite}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface hover:bg-surfaceHover border border-border text-textPrimary transition-all disabled:opacity-50"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5 text-primary', bootstrapping && 'animate-spin')} />
              Sync NSE/BSE Defaults
            </button>
          </div>

          <form onSubmit={handleAddHoliday} className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-textMuted mb-1">Holiday Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                disabled={!canWrite || submitting}
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted mb-1">Holiday Name</label>
              <input
                type="text"
                placeholder="e.g. Diwali Balipratipada"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                disabled={!canWrite || submitting}
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl text-textPrimary placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted mb-1">Description (Optional)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Trading Holiday"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  disabled={!canWrite || submitting}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl text-textPrimary placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="submit"
                  disabled={!canWrite || submitting}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold text-xs rounded-xl shadow-sm transition-all whitespace-nowrap disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Info Card */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 text-primary font-bold text-sm mb-1">
              <Sparkles className="w-4 h-4" />
              Automated Cadence Switching
            </div>
            <p className="text-xs text-textMuted leading-relaxed">
              When today is matched against this registry, the background worker dynamically adjusts from
              <strong className="text-textPrimary"> 30-second core market polling</strong> down to a calm
              <strong className="text-textPrimary"> 30-minute idle cadence</strong>, saving thousands of redundant exchange calls.
            </p>
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-textMuted">
            <span>Today (IST):</span>
            <span className="font-mono font-semibold text-textPrimary">{todayIST || 'Calculating...'}</span>
          </div>
        </div>
      </div>

      {/* ── Holidays Table ─────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search holidays..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-textPrimary placeholder:text-textMuted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
            {['ALL', 'UPCOMING', 'TODAY', 'PAST'].map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={clsx(
                  'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
                  statusFilter === tab
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-textMuted hover:text-textPrimary hover:bg-surface'
                )}
              >
                {tab}
              </button>
            ))}
            <button
              onClick={() => fetchHolidays(false)}
              disabled={refreshing}
              className="p-1.5 ml-2 text-textMuted hover:text-textPrimary hover:bg-surface rounded-lg transition-all"
              title="Refresh list"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Directory List */}
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
            <p className="text-xs text-textMuted">Loading market calendar...</p>
          </div>
        ) : filteredHolidays.length === 0 ? (
          <div className="p-12 text-center text-textMuted">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-textPrimary">No holidays found</p>
            <p className="text-xs mt-1">Try clearing your search query or sync the official calendar defaults.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface/50 text-textMuted uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Holiday Name</th>
                  <th className="py-3 px-4">Category / Note</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredHolidays.map((h) => {
                  const isToday = h.status === 'today'
                  const isUpcoming = h.status === 'upcoming'

                  return (
                    <tr
                      key={h.date}
                      className={clsx(
                        'hover:bg-surfaceHover/50 transition-colors',
                        isToday && 'bg-amber-500/5 dark:bg-amber-500/10'
                      )}
                    >
                      <td className="py-3 px-4 font-mono font-medium text-textPrimary whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-textMuted font-mono">
                            {formatDateDisplay(h.date)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-textPrimary">
                        {h.name}
                      </td>
                      <td className="py-3 px-4 text-textMuted">
                        {h.description || 'Indian Market Trading Holiday'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isToday ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3 animate-pulse" />
                            Today (Closed)
                          </span>
                        ) : isUpcoming ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CalendarDays className="w-3 h-3" />
                            In {h.daysUntil} day{h.daysUntil === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-textMuted border border-border">
                            Past Holiday
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteHoliday(h.date, h.name)}
                          disabled={!canWrite}
                          className="p-1.5 text-textMuted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-30"
                          title={`Delete ${h.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
