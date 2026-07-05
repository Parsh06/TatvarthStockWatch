import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, Search, Trash2, Star, Zap, X, ExternalLink, FileText, Mail, RefreshCw, TrendingUp, Clock, Download } from 'lucide-react'
import clsx from 'clsx'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useAnnouncements } from '../../hooks/useAnnouncements'
import { useTier } from '../../contexts/TierContext'
import { useRatesSocket } from '../../hooks/useRatesSocket'
import { apiClient } from '../../services/apiClient'
import { getCategoryColor } from '../../utils/formatters'
import ScriptCard from './ScriptCard'
import SetAlertModal from './SetAlertModal'
import AddScriptModal from './AddScriptModal'
import BulkUploadModal from './BulkUploadModal'
import ScriptDrawer from './ScriptDrawer'
import EmptyState from '../Common/EmptyState'
import { SkeletonCard } from '../Common/Loader'
import PageTransition from '../Common/PageTransition'
import ConfirmDialog from '../Common/ConfirmDialog'
import toast from 'react-hot-toast'

const SORT_OPTIONS = [
  { value: 'recent',   label: 'Recently Added' },
  { value: 'name',     label: 'Name A–Z' },
  { value: 'nameDesc', label: 'Name Z–A' },
  { value: 'mostNews', label: 'Most Announcements' },
  { value: 'topGain',  label: 'Top Gainers' },
  { value: 'topLoss',  label: 'Top Losers' },
]

function AnnouncementRow({ ann }) {
  const navigate = useNavigate()
  const code = ann.scriptCode || ann.scripCode || ''
  const name = ann.scriptName || ann.companyName || code

  function goToCompany(e) {
    e.stopPropagation()
    if (code) navigate('/company-data', { state: { script: { bseCode: code, scripName: name, symbol: ann.nseSymbol || '' } } })
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-white/[0.02] transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={goToCompany}
            className="font-semibold text-textPrimary text-sm hover:text-primary transition text-left"
            title="View company data">
            {name}
          </button>
          {code && <span className="font-mono text-xs text-textMuted bg-white/5 px-1.5 py-0.5 rounded">{code}</span>}
          <span className={clsx('text-xs px-2 py-0.5 rounded-full border', getCategoryColor(ann.category))}>
            {ann.category || 'General'}
          </span>
          {ann.critical && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 font-semibold">CRITICAL</span>
          )}
        </div>
        <p className="text-sm text-textMuted mt-1 line-clamp-2">{ann.subject || ann.description}</p>
        <p className="text-xs text-textMuted/60 mt-1">{ann.datetimeIST || ann.date}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {ann.pdfUrl && (
          <a href={ann.pdfUrl} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-medium transition">
            <FileText className="w-3.5 h-3.5" /> PDF
          </a>
        )}
        {ann.sourceUrl && (
          <a href={ann.sourceUrl} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-textMuted border border-border rounded-lg text-xs transition">
            <ExternalLink className="w-3.5 h-3.5" /> BSE
          </a>
        )}
      </div>
    </div>
  )
}

export default function WatchlistPage() {
  const [search, setSearch]           = useState('')
  const [exchange, setExchange]       = useState('')
  const [sort, setSort]               = useState('recent')
  const [addOpen, setAddOpen]         = useState(false)
  const [bulkOpen, setBulkOpen]       = useState(false)
  const [drawerScript, setDrawerScript]   = useState(null)
  const [alertScript,  setAlertScript]    = useState(null)
  const [alertOverrides, setAlertOverrides] = useState({})
  const [bulkMode, setBulkMode]       = useState(false)
  const [selected, setSelected]       = useState(new Set())
  const [clearConfirm, setClearConfirm]           = useState(false)
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false)
  const [activeGroup, setActiveGroup]             = useState('')

  const [triggering, setTriggering]             = useState(false)
  const [triggerAnnouncements, setTriggerAnnouncements] = useState(null)
  const [annFetchedAt, setAnnFetchedAt]         = useState(null)

  const [rates, setRates]               = useState({})
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null)
  const [ratesFetching, setRatesFetching]   = useState(false)
  const [ratesCount, setRatesCount]         = useState(0)
  
  const pendingRatesRef = useRef(null)
  const flushTimerRef   = useRef(null)

  const flushPendingRates = useCallback(() => {
    if (!pendingRatesRef.current) return
    const { rates: newRates, meta } = pendingRatesRef.current
    pendingRatesRef.current = null
    setRates(prev => ({ ...prev, ...newRates }))
    if (meta.fetchedAt) setRatesUpdatedAt(meta.fetchedAt)
    setRatesCount(meta.success || Object.keys(newRates).length)
  }, [])

  function applyRates(d, merge = false) {
    if (d?.rates && typeof d.rates === 'object' && Object.keys(d.rates).length > 0) {
      if (merge) {
        if (!pendingRatesRef.current) pendingRatesRef.current = { rates: {}, meta: d }
        Object.assign(pendingRatesRef.current.rates, d.rates)
        pendingRatesRef.current.meta = d
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null
            flushPendingRates()
          }, 800)
        }
      } else {
        if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null }
        pendingRatesRef.current = null
        setRates(d.rates)
        setRatesUpdatedAt(d.fetchedAt || null)
        setRatesCount(d.success || Object.keys(d.rates).length)
      }
      return true
    }
    return false
  }

  const { liveRates } = useRatesSocket()

  useEffect(() => {
    if (Object.keys(liveRates).length > 0) {
      const now = new Date().toISOString()
      applyRates({ rates: liveRates, fetchedAt: now }, true)
      setRatesFetching(false)
      // Since backend cronjob updates both rates and announcements at the exact same time,
      // sync the UI fetch time so the user knows announcements are also up to date.
      setAnnFetchedAt(now)
    }
  }, [liveRates])

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [])

  async function triggerRefresh() {
    setRatesFetching(true)
    try {
      await fetch('/api/rates/refresh', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    } catch {
      setRatesFetching(false)
    }
  }

  const { watchlist, loading, removeScript, clearWatchlist, filtered } = useWatchlist({ search, exchange })
  const { isPremium, limits } = useTier()
  const atScriptLimit = !isPremium && watchlist.length >= limits.maxScripts

  const { announcements: storedAnnouncements } = useAnnouncements({ watchlist, autoFetch: true })

  // Build a map of code → { idSet: Set<string>, lastDate, lastSubject }
  // We track IDs so we can deduplicate when a card has both a BSE code and NSE symbol
  // (same announcement gets bumped under both keys)
  const announcementsByCode = useMemo(() => {
    const map = {}
    function bump(key, ann) {
      if (!key) return
      const id = String(ann.id || ann.newsId || '')
      if (!map[key]) map[key] = { idSet: new Set(), lastDate: null, lastSubject: null }
      if (id) map[key].idSet.add(id)
      if (!map[key].lastDate || ann.announcementDate > map[key].lastDate) {
        map[key].lastDate    = ann.announcementDate
        map[key].lastSubject = ann.subject || ann.headline || null
      }
    }
    for (const ann of storedAnnouncements) {
      bump(ann.scriptCode || ann.scripCode || '', ann)
      if (ann.nseSymbol) bump(ann.nseSymbol, ann)
    }
    return map
  }, [storedAnnouncements])

  const groups = useMemo(() => {
    const map = {}
    for (const s of watchlist) {
      const g = s.group || ''
      map[g] = (map[g] || 0) + 1
    }
    return map
  }, [watchlist])
  const groupNames = Object.keys(groups).filter(Boolean).sort()

  const groupFiltered = activeGroup
    ? filtered.filter((s) => (s.group || '') === activeGroup)
    : filtered

  const sorted = [...groupFiltered].sort((a, b) => {
    const codeA = a.ltdCode || a.bseCode || ''
    const codeB = b.ltdCode || b.bseCode || ''
    if (sort === 'name')     return (a.scriptName || '').localeCompare(b.scriptName || '')
    if (sort === 'nameDesc') return (b.scriptName || '').localeCompare(a.scriptName || '')
    if (sort === 'mostNews') {
      const symA = a.symbol || '', symB = b.symbol || ''
      const countA = new Set([...(announcementsByCode[codeA]?.idSet || []), ...(announcementsByCode[symA]?.idSet || [])]).size
      const countB = new Set([...(announcementsByCode[codeB]?.idSet || []), ...(announcementsByCode[symB]?.idSet || [])]).size
      return countB - countA
    }
    if (sort === 'topGain')  return (rates[codeB]?.pctChange ?? -999) - (rates[codeA]?.pctChange ?? -999)
    if (sort === 'topLoss')  return (rates[codeA]?.pctChange ?? 999) - (rates[codeB]?.pctChange ?? 999)
    return new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
  })

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleBulkRemove() {
    for (const id of selected) await removeScript(id)
    toast.success(`${selected.size} scripts removed`)
    setSelected(new Set())
    setBulkMode(false)
    setBulkRemoveConfirm(false)
  }

  async function handleClearAll() {
    try {
      await clearWatchlist()
      toast.success('Watchlist cleared')
    } catch {
      toast.error('Failed to clear watchlist')
    } finally {
      setClearConfirm(false)
    }
  }

  async function handleTrigger(silent = false) {
    if (watchlist.length === 0) { 
      if (!silent) toast.error('Add scripts to your watchlist first'); 
      return 
    }
    setTriggering(true)
    const triggerTime = new Date().toISOString()
    try {
      const data = await apiClient(`/api/trigger${silent === true ? '?silent=1' : ''}`, { method: 'POST' })
      setTriggerAnnouncements(data.announcements || [])
      setAnnFetchedAt(new Date().toISOString())

      window.dispatchEvent(new CustomEvent('announcements-fetched'))
      
      if (!silent) {
        if (data.total === 0) {
          toast.success('No new announcements found today')
        } else {
          const parts  = []
          if (data.bseMatched > 0) parts.push(`${data.bseMatched} BSE`)
          if (data.nseMatched > 0) parts.push(`${data.nseMatched} NSE`)
          const label  = parts.length ? `(${parts.join(' + ')})` : ''
          const notifs = [data.emailSent && 'email', data.telegramSent && 'Telegram'].filter(Boolean)
          const suffix = notifs.length ? ` — ${notifs.join(' + ')} sent!` : ''
          toast.success(`${data.total} announcement${data.total !== 1 ? 's' : ''} found ${label}${suffix}`, { duration: 5000 })
        }
      }
    } catch (e) {
      if (!silent) toast.error(`Failed to fetch: ${e.message}`)
    } finally {
      setTriggering(false)
    }
  }

  const autoTriggeredRef = useRef(false)
  useEffect(() => {
    if (!loading && watchlist.length > 0 && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true
      handleTrigger(true)
    }
  }, [loading, watchlist.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function fmtTime(iso) {
    if (!iso) return null
    try {
      const d = new Date(iso)
      const now = new Date()
      const isToday = d.toDateString() === now.toDateString()
      const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      if (isToday) return `Today ${time}`
      const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      return `${date} ${time}`
    } catch { return null }
  }

  const ratesHaveData = ratesCount > 0

  return (
    <PageTransition className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-textPrimary">My Watchlist</h1>
            <span className="px-2.5 py-1 bg-primary/15 text-primary text-xs font-semibold rounded-full">
              {watchlist.length} scripts
            </span>
          </div>

          {/* Action buttons — wrap on mobile */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleTrigger(false)}
              disabled={triggering}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition',
                triggering
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 cursor-wait'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/30'
              )}
            >
              {triggering
                ? <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                : <Zap className="w-4 h-4" />
              }
              {triggering ? 'Fetching...' : 'Fetch Latest Data'}
            </button>
            <button onClick={() => setBulkOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/25 rounded-lg text-sm font-medium transition">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Bulk Add</span>
            </button>
            <button onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Script</span>
            </button>
            <button onClick={() => setClearConfirm(true)}
              disabled={watchlist.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-sm font-medium transition disabled:opacity-50">
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear All</span>
            </button>
            <button
              onClick={() => { setBulkMode(!bulkMode); setSelected(new Set()) }}
              className={clsx(
                'px-3 py-2 text-sm font-medium rounded-lg border transition',
                bulkMode ? 'bg-primary/20 border-primary text-primary' : 'border-border text-textMuted hover:text-textPrimary'
              )}
            >
              {bulkMode ? 'Cancel' : 'Select'}
            </button>
            <a href="/api/watchlist/export" download
               className="flex items-center gap-1.5 px-3 py-2 border border-border text-textMuted hover:text-textPrimary hover:border-primary/40 rounded-lg text-sm transition"
               title="Export watchlist to CSV">
              <Download className="w-4 h-4" />
            </a>
            <a href="/api/email-preview" target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 px-3 py-2 border border-border text-textMuted hover:text-textPrimary hover:border-primary/40 rounded-lg text-sm transition"
               title="Email preview">
              <Mail className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* ── Status bars ── */}
        <div className="flex flex-col gap-2">
          {/* Announcements */}
          <div className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-xl border text-xs flex-wrap shadow-sm transition-colors',
            annFetchedAt ? 'bg-amber-500/10 border-amber-500/20' : 'bg-black/20 border-white/5'
          )}>
            <div className="flex items-center gap-1.5">
              <Zap className={clsx('w-3.5 h-3.5', annFetchedAt ? 'text-amber-400' : 'text-textMuted/40')} />
              <span className={annFetchedAt ? 'text-amber-400 font-medium' : 'text-textMuted/50'}>
                {annFetchedAt
                  ? `${triggerAnnouncements?.length ?? 0} announcement${(triggerAnnouncements?.length ?? 0) !== 1 ? 's' : ''} fetched`
                  : 'Announcements not fetched yet'}
              </span>
            </div>
            {annFetchedAt && (
              <span className="flex items-center gap-1 text-textMuted/60">
                <Clock className="w-3 h-3" />
                News fetched: {fmtTime(annFetchedAt)}
              </span>
            )}
            {triggering && (
              <span className="flex items-center gap-1.5 text-amber-400/80">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Fetching announcements…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Free tier limit warning ── */}
      {atScriptLimit && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-400/10 border border-amber-400/25 rounded-xl text-sm">
          <span className="text-amber-400">⚡</span>
          <span className="text-amber-400 flex-1">You've reached the 10-script limit on the Free plan.</span>
          <a href="/premium" className="shrink-0 px-3 py-1 bg-amber-400/20 hover:bg-amber-400/30 text-amber-400 font-semibold rounded-lg text-xs transition">Upgrade</a>
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {bulkMode && selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/10 border border-primary/30 rounded-xl">
          <span className="text-sm text-primary font-medium">{selected.size} selected</span>
          <button onClick={() => setBulkRemoveConfirm(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 rounded-lg text-xs font-medium transition">
            <Trash2 className="w-3.5 h-3.5" /> Remove Selected
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-2 glass-panel p-2 rounded-2xl shadow-inner">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full bg-black/20 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-textPrimary placeholder-textMuted/40 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm shadow-sm transition-all" />
        </div>
        <select value={exchange} onChange={(e) => setExchange(e.target.value)}
          className="bg-black/20 border border-white/5 rounded-xl px-3 py-2.5 text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm shadow-sm cursor-pointer transition-all">
          <option value="">All Exchanges</option>
          <option value="BSE">BSE</option>
          <option value="NSE">NSE</option>
          <option value="BOTH">BOTH</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="bg-black/20 border border-white/5 rounded-xl px-3 py-2.5 text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm shadow-sm cursor-pointer transition-all">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Group tabs ── */}
      {groupNames.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveGroup('')}
            className={clsx(
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition hover:-translate-y-0.5 shadow-sm',
              activeGroup === ''
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-white/5 border-white/10 text-textMuted hover:text-textPrimary hover:border-primary/40'
            )}
          >
            All <span className="text-xs opacity-70">{watchlist.length}</span>
          </button>
          {groupNames.map((g) => {
            const annCount = watchlist
              .filter((s) => s.group === g)
              .reduce((sum, s) => {
                const c   = s.ltdCode || s.bseCode || ''
                const sym = s.symbol || ''
                const ids = new Set([...(announcementsByCode[c]?.idSet || []), ...(announcementsByCode[sym]?.idSet || [])])
                return sum + ids.size
              }, 0)
            return (
              <button key={g} onClick={() => setActiveGroup(activeGroup === g ? '' : g)}
                className={clsx(
                  'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition hover:-translate-y-0.5 shadow-sm',
                  activeGroup === g
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-white/5 border-white/10 text-textMuted hover:text-textPrimary hover:border-primary/40'
                )}
              >
                {g} <span className="text-xs opacity-70">{groups[g]}</span>
                {annCount > 0 && (
                  <span className="min-w-[18px] px-1 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-400">
                    {annCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Script grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7,8].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Star}
          title={search || exchange || activeGroup ? 'No matching scripts' : 'Your watchlist is empty'}
          subtitle={search || exchange || activeGroup ? 'Try adjusting your filters' : 'Add your first script to start tracking announcements'}
          action={!search && !exchange && !activeGroup ? { label: 'Add Script', onClick: () => setAddOpen(true) } : undefined}
        />
      ) : (
        <>
          <p className="text-xs text-textMuted/50">{sorted.length} script{sorted.length !== 1 ? 's' : ''} shown</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((script) => {
              const code = script.ltdCode || script.bseCode || ''
              const sym  = script.symbol  || ''
              const bseSt = announcementsByCode[code] || {}
              const nseSt = announcementsByCode[sym]  || {}
              const mergedIds = new Set([...(bseSt.idSet || []), ...(nseSt.idSet || [])])
              const lastDate  = (bseSt.lastDate || '') > (nseSt.lastDate || '') ? bseSt.lastDate : (nseSt.lastDate || bseSt.lastDate)
              const annStats = {
                count:       mergedIds.size,
                lastDate,
                lastSubject: (bseSt.lastDate || '') > (nseSt.lastDate || '') ? bseSt.lastSubject : (nseSt.lastSubject || bseSt.lastSubject),
              }
              // Merge alert overrides so the card updates instantly after modal save
              const scriptWithAlert = alertOverrides[script.id]
                ? { ...script, ...alertOverrides[script.id] }
                : script
              return (
                <ScriptCard
                  key={script.id}
                  script={scriptWithAlert}
                  annStats={annStats}
                  rate={rates[code] || null}
                  onOpenDrawer={setDrawerScript}
                  onSetAlert={(s) => setAlertScript(scriptWithAlert)}
                  bulkMode={bulkMode}
                  isSelected={selected.has(script.id)}
                  onSelect={toggleSelect}
                />
              )
            })}
          </div>
        </>
      )}

      {/* ── Announcements panel ── */}
      {triggerAnnouncements !== null && (
        <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3 flex-wrap">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-semibold text-textPrimary text-sm">Today's Announcements</span>
              <span className={clsx('px-2.5 py-0.5 text-xs font-medium rounded-full',
                triggerAnnouncements.length > 0 ? 'bg-amber-400/15 text-amber-400' : 'bg-white/5 text-textMuted')}>
                {triggerAnnouncements.length} found
              </span>
            </div>
            <button onClick={() => setTriggerAnnouncements(null)} className="text-textMuted hover:text-textPrimary transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          {triggerAnnouncements.length === 0 ? (
            <div className="px-6 py-12 text-center text-textMuted text-sm">
              No new announcements for your watchlist today.
            </div>
          ) : (
            <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto scrollbar-hide">
              {triggerAnnouncements.map((ann) => <AnnouncementRow key={ann.id} ann={ann} />)}
            </div>
          )}
        </div>
      )}

      <SetAlertModal
        script={alertScript}
        rate={alertScript ? (rates[alertScript.ltdCode || alertScript.bseCode || ''] || null) : null}
        onClose={() => setAlertScript(null)}
        onSaved={(updated) => {
          setAlertOverrides((prev) => ({ ...prev, [updated.id]: {
            alertAbove: updated.alertAbove,
            alertBelow: updated.alertBelow,
            alertEnabled: updated.alertEnabled,
          }}))
        }}
      />
      <AddScriptModal isOpen={addOpen} onClose={() => setAddOpen(false)} />
      <BulkUploadModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} />
      <ScriptDrawer script={drawerScript} onClose={() => setDrawerScript(null)} />

      <ConfirmDialog isOpen={bulkRemoveConfirm} title="Remove Scripts"
        message={`Remove ${selected.size} selected scripts from your watchlist?`}
        confirmLabel="Remove" onConfirm={handleBulkRemove} onCancel={() => setBulkRemoveConfirm(false)} danger />
      <ConfirmDialog isOpen={clearConfirm} title="Clear Watchlist"
        message="This will permanently remove all scripts from your watchlist."
        confirmLabel="Clear All" onConfirm={handleClearAll} onCancel={() => setClearConfirm(false)} danger />
    </PageTransition>
  )
}
