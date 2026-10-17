import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, Search, Trash2, Star, Zap, X, ExternalLink, FileText, Mail, RefreshCw, TrendingUp, Clock, Download, Share2, Crown } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useAnnouncements } from '../../hooks/useAnnouncements'
import { useCronStatus } from '../../hooks/useCronStatus'
import { apiClient } from '../../services/apiClient'
import { getCategoryColor } from '../../utils/formatters'
import ScriptCard from './ScriptCard'
import AddScriptModal from './AddScriptModal'
import BulkUploadModal from './BulkUploadModal'
import ShareBasketModal from './ShareBasketModal'
import ScriptDrawer from './ScriptDrawer'
import EmptyState from '../Common/EmptyState'
import { SkeletonCard } from '../Common/Loader'
import PageTransition from '../Common/PageTransition'
import ConfirmDialog from '../Common/ConfirmDialog'
import UpgradePromptModal from '../Plans/UpgradePromptModal'
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
  const [shareBasketOpen, setShareBasketOpen] = useState(false)
  const [drawerScript, setDrawerScript]   = useState(null)
  const [bulkMode, setBulkMode]       = useState(false)
  const [selected, setSelected]       = useState(new Set())
  const [triggering, setTriggering]   = useState(false)
  const [clearConfirm, setClearConfirm]           = useState(false)
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false)
  const [activeGroup, setActiveGroup]             = useState('')
  const cronStatus = useCronStatus()
  const { plan, isPro, isPremium, planLimits } = useAuth()
  const [upgradeModal, setUpgradeModal] = useState({ open: false, title: '', message: '', targetTier: 'pro' })

  const maxWL = planLimits?.maxWatchlist ?? 5
  const isWatchlistFull = maxWL !== Infinity && watchlist?.length >= maxWL

  function handleOpenAdd() {
    if (isWatchlistFull) {
      setUpgradeModal({
        open: true,
        title: 'Watchlist Limit Reached',
        message: `You have reached your limit of ${maxWL} scripts on the ${plan?.toUpperCase() || 'BASIC'} plan. Upgrade to Pro to track up to 50 companies with instant push notifications, or Premium for unlimited monitoring.`,
        targetTier: 'pro',
      })
      return
    }
    setAddOpen(true)
  }

  function handleOpenBulk() {
    if (isWatchlistFull) {
      setUpgradeModal({
        open: true,
        title: 'Watchlist Limit Reached',
        message: `You have reached your limit of ${maxWL} scripts on the ${plan?.toUpperCase() || 'BASIC'} plan. Upgrade to Pro to upload bulk CSV watchlists and track up to 50 scripts.`,
        targetTier: 'pro',
      })
      return
    }
    setBulkOpen(true)
  }

  function handleShareBasket() {
    const maxBaskets = planLimits?.maxCuratedBaskets ?? 0
    if (maxBaskets === 0) {
      setUpgradeModal({
        open: true,
        title: 'Shareable Curated Baskets',
        message: 'Curated Watchlist Baskets with viral public links are exclusively available on Pro & Premium tiers. Package high-conviction ideas and share with 1 tap.',
        targetTier: 'pro',
      })
      return
    }
    setShareBasketOpen(true)
  }

  function handleExportCsv(e) {
    if (!planLimits?.canExportCsv) {
      e.preventDefault()
      setUpgradeModal({
        open: true,
        title: 'CSV / Excel Export',
        message: 'Institutional spreadsheet exports are reserved for Pro and Premium members. Export complete watchlist holdings, LTD codes, and company notes with 1 click.',
        targetTier: 'pro',
      })
    }
  }

  const { watchlist, loading, removeScript, clearWatchlist, filtered } = useWatchlist({ search, exchange })

  const { announcements: storedAnnouncements, lastFetched } = useAnnouncements({ watchlist, autoFetch: true })

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

  return (
    <PageTransition className="space-y-6">
      {/* ── Global Cron Status ── */}
      {(cronStatus?.lastRun || lastFetched) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-500/90 shadow-sm animate-fade-in-up">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Announcements fetched: <strong>{fmtTime(cronStatus?.lastRun || lastFetched)}</strong></span>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-textPrimary">My Watchlist</h1>
            <div className="flex items-center gap-2">
              <span className={clsx(
                "px-2.5 py-1 text-xs font-semibold rounded-full border flex items-center gap-1.5 transition-colors",
                isWatchlistFull
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "bg-primary/15 text-primary border-primary/20"
              )}>
                <span>{watchlist.length} / {maxWL === Infinity ? '∞' : maxWL} scrips</span>
                {isWatchlistFull && (
                  <span className="text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                    Limit Reached
                  </span>
                )}
              </span>
              {isWatchlistFull && (
                <button
                  onClick={() => setUpgradeModal({
                    open: true,
                    title: 'Expand Watchlist Capacity',
                    message: `You've filled all ${maxWL} watchlist slots on your ${plan?.toUpperCase()} plan. Upgrade to Pro for 50 scrips or Premium for unlimited monitoring.`,
                    targetTier: 'pro'
                  })}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-full transition shadow-sm"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span>Upgrade</span>
                </button>
              )}
            </div>
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
            <button onClick={handleOpenBulk}
              className="flex items-center gap-1.5 px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/25 rounded-lg text-sm font-medium transition">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Bulk Add</span>
            </button>
            <button onClick={handleShareBasket}
              disabled={watchlist.length === 0}
              title="Share curated basket via viral public link"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-lg text-sm font-medium transition disabled:opacity-50">
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share Basket</span>
            </button>
            <button onClick={handleOpenAdd}
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
               onClick={handleExportCsv}
               className={clsx(
                 "flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition",
                 planLimits?.canExportCsv
                   ? "border-border text-textMuted hover:text-textPrimary hover:border-primary/40"
                   : "border-amber-500/30 text-amber-400 bg-amber-500/5 hover:bg-amber-500/15"
               )}
               title={planLimits?.canExportCsv ? "Export watchlist to CSV" : "Pro Feature: Export to CSV"}>
              <Download className="w-4 h-4" />
              {!planLimits?.canExportCsv && <span className="text-[10px] font-bold uppercase">PRO</span>}
            </a>
            <a href="/api/email-preview" target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 px-3 py-2 border border-border text-textMuted hover:text-textPrimary hover:border-primary/40 rounded-lg text-sm transition"
               title="Email preview">
              <Mail className="w-4 h-4" />
            </a>
          </div>
        </div>

        </div>

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
              return (
                <ScriptCard 
                  key={script.id} 
                  script={script} 
                  annStats={annStats}
                  onOpenDrawer={setDrawerScript}
                  bulkMode={bulkMode}
                  isSelected={selected.has(script.id)}
                  onSelect={toggleSelect}
                />
              )
            })}
          </div>
        </>
      )}

      <AddScriptModal isOpen={addOpen} onClose={() => setAddOpen(false)} />
      <BulkUploadModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} />
      <ShareBasketModal isOpen={shareBasketOpen} onClose={() => setShareBasketOpen(false)} watchlist={watchlist} />
      <ScriptDrawer script={drawerScript} onClose={() => setDrawerScript(null)} />

      <ConfirmDialog isOpen={bulkRemoveConfirm} title="Remove Scripts"
        message={`Remove ${selected.size} selected scripts from your watchlist?`}
        confirmLabel="Remove" onConfirm={handleBulkRemove} onCancel={() => setBulkRemoveConfirm(false)} danger />
      <ConfirmDialog isOpen={clearConfirm} title="Clear Watchlist"
        message="This will permanently remove all scripts from your watchlist."
        confirmLabel="Clear All" onConfirm={handleClearAll} onCancel={() => setClearConfirm(false)} danger />

      <UpgradePromptModal
        isOpen={upgradeModal.open}
        onClose={() => setUpgradeModal(prev => ({ ...prev, open: false }))}
        title={upgradeModal.title}
        message={upgradeModal.message}
        targetTier={upgradeModal.targetTier}
      />
    </PageTransition>
  )
}
