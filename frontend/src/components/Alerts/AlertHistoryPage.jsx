import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, BellRing, TrendingUp, TrendingDown, Trash2, RefreshCw, Mail, Send, AlertTriangle, Clock, CheckCircle2, Zap, Activity } from 'lucide-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useWatchlist } from '../../contexts/WatchlistContext'
import { apiClient } from '../../services/apiClient'
import { getAlerts, getRecentAlerts, deleteAlert, clearAllAlerts, setScriptAlert } from '../../services/alertService'
import ConfirmDialog from '../Common/ConfirmDialog'
import toast from 'react-hot-toast'

function fmt(n, dec = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return iso }
}

// ── Active Alert row (configured threshold, not yet fired) ────────────────────
function ActiveAlertRow({ script, rate, onDisable }) {
  const ltp       = rate?.ltp ?? null
  const pctChange = rate?.pctChange ?? null
  const code      = script.ltdCode || script.bseCode

  // How close is LTP to each threshold? (% distance)
  function pctToThreshold(threshold) {
    if (!ltp || !threshold) return null
    return ((ltp - threshold) / threshold * 100).toFixed(1)
  }
  const distAbove = script.alertAbove != null ? pctToThreshold(script.alertAbove) : null
  const distBelow = script.alertBelow != null ? pctToThreshold(script.alertBelow) : null

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-white/[0.02] transition group">
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
        <BellRing className="w-4 h-4 text-amber-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-textPrimary text-sm">{script.scriptName}</span>
          <code className="text-[11px] font-mono text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">{code}</code>
          <span className={clsx(
            'text-[10px] px-1.5 py-0.5 rounded font-semibold border',
            script.alertEnabled
              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
              : 'text-textMuted/50 bg-white/5 border-border'
          )}>
            {script.alertEnabled ? '● Active' : '○ Paused'}
          </span>
          {/* Live LTP */}
          {ltp != null && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-textPrimary bg-white/5 border border-border px-2 py-0.5 rounded">
              <Activity className="w-3 h-3 text-primary" />
              ₹{fmt(ltp)}
              {pctChange != null && (
                <span className={clsx('ml-0.5', pctChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {pctChange >= 0 ? '+' : ''}{fmt(pctChange)}%
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          {script.alertAbove != null && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <TrendingUp className="w-3 h-3" />
                Above ₹{fmt(script.alertAbove)}
              </span>
              {distAbove != null && (
                <span className={clsx('text-xs font-medium', Number(distAbove) >= 0 ? 'text-red-400' : 'text-textMuted/60')}>
                  {Number(distAbove) >= 0 ? '▲ breached' : `${Math.abs(distAbove)}% away`}
                </span>
              )}
            </div>
          )}
          {script.alertBelow != null && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-red-400">
                <TrendingDown className="w-3 h-3" />
                Below ₹{fmt(script.alertBelow)}
              </span>
              {distBelow != null && (
                <span className={clsx('text-xs font-medium', Number(distBelow) <= 0 ? 'text-red-400' : 'text-textMuted/60')}>
                  {Number(distBelow) <= 0 ? '▼ breached' : `${Math.abs(distBelow)}% away`}
                </span>
              )}
            </div>
          )}
          {ltp == null && (
            <span className="text-xs text-textMuted/40">No live rate — fires on next fetch</span>
          )}
        </div>
      </div>

      <button
        onClick={() => onDisable(script)}
        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-textMuted/50 hover:text-danger hover:border-danger/30 rounded-lg text-xs transition opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Remove
      </button>
    </div>
  )
}

// ── Fired Alert row (historical) ──────────────────────────────────────────────
function FiredAlertRow({ alert, onDelete }) {
  const isAbove = alert.direction === 'above'

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-white/[0.02] transition group">
      <div className={clsx(
        'flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center',
        isAbove ? 'bg-emerald-500/15' : 'bg-red-500/15'
      )}>
        {isAbove
          ? <TrendingUp className="w-4 h-4 text-emerald-400" />
          : <TrendingDown className="w-4 h-4 text-red-400" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-textPrimary text-sm">{alert.scriptName}</span>
          <code className="text-[11px] font-mono text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">{alert.scriptCode}</code>
          <span className={clsx(
            'text-xs font-semibold px-2 py-0.5 rounded-full border',
            isAbove
              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
              : 'text-red-400 bg-red-400/10 border-red-400/20'
          )}>
            {isAbove ? '▲ Above' : '▼ Below'} ₹{fmt(alert.threshold)}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-textMuted flex-wrap">
          <span>LTP was <strong className="text-textPrimary">₹{fmt(alert.ltp)}</strong></span>
          {alert.pctChange != null && (
            <span className={alert.pctChange >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {alert.pctChange >= 0 ? '+' : ''}{fmt(alert.pctChange)}%
            </span>
          )}
          <span className="flex items-center gap-1 text-textMuted/60">
            <Clock className="w-3 h-3" />
            {fmtTime(alert.triggeredAt)}
          </span>
        </div>
        {alert.notified?.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {alert.notified.includes('email') && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-sky-400/10 text-sky-400 rounded font-medium">
                <Mail className="w-2.5 h-2.5" /> Email sent
              </span>
            )}
            {alert.notified.includes('telegram') && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-400/10 text-blue-400 rounded font-medium">
                <Send className="w-2.5 h-2.5" /> Telegram sent
              </span>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => onDelete(alert.id)}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-textMuted/40 hover:text-danger hover:bg-danger/10 rounded-lg transition opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AlertHistoryPage() {
  const { currentUser }         = useAuth()
  const { watchlist, loading: wlLoading, refresh: refreshWatchlist } = useWatchlist()
  const navigate                = useNavigate()

  const [tab, setTab]             = useState('active')   // 'active' | 'history'
  const [firedAlerts, setFiredAlerts]   = useState([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [clearConfirm, setClearConfirm]   = useState(false)

  // Live rates for active alert distance display
  const [liveRates, setLiveRates] = useState({})
  const lastAlertPollRef = useRef(new Date().toISOString())
  const pollTimerRef     = useRef(null)

  const activeAlerts = watchlist.filter(
    (s) => s.alertAbove != null || s.alertBelow != null
  )

  const loadFired = useCallback(async () => {
    setLoadingAlerts(true)
    try {
      const data = await getAlerts(currentUser?.uid)
      setFiredAlerts(data)
    } catch {
      toast.error('Failed to load alert history')
    } finally {
      setLoadingAlerts(false)
    }
  }, [currentUser])

  useEffect(() => { loadFired() }, [loadFired])

  // Fetch live rates once on mount
  useEffect(() => {
    apiClient('/api/rates')
      .then((d) => setLiveRates(d?.rates || {}))
      .catch(() => {})
  }, [])

  // Poll for newly fired alerts every 30s — show toast + refresh history list
  useEffect(() => {
    if (!currentUser) return
    const poll = async () => {
      try {
        const recent = await getRecentAlerts(currentUser.uid, lastAlertPollRef.current)
        if (recent.length > 0) {
          lastAlertPollRef.current = new Date().toISOString()
          for (const a of recent) {
            const dir  = a.direction === 'above' ? '▲ Above' : '▼ Below'
            const notif = a.notified?.length > 0 ? ` · ${a.notified.join(' + ')} sent` : ''
            toast(`🚨 ${a.scriptName} ${dir} ₹${a.threshold} — LTP ₹${a.ltp}${notif}`, {
              duration: 8000,
              style: { background: a.direction === 'above' ? '#052e16' : '#2d0a0a', color: '#f1f5f9', border: '1px solid #334155' },
            })
          }
          // Refresh the fired list so it shows new entries
          setFiredAlerts((prev) => [...recent, ...prev])
          setTab('history')
        }
      } catch { /* ignore poll errors */ }
    }
    pollTimerRef.current = setInterval(poll, 30000)
    return () => clearInterval(pollTimerRef.current)
  }, [currentUser])

  async function handleDeleteFired(id) {
    try {
      await deleteAlert(currentUser?.uid, id)
      setFiredAlerts((prev) => prev.filter((a) => a.id !== id))
    } catch {
      toast.error('Failed to delete alert')
    }
  }

  async function handleClearAll() {
    try {
      await clearAllAlerts(currentUser?.uid)
      setFiredAlerts([])
      toast.success('Alert history cleared')
    } catch {
      toast.error('Failed to clear alerts')
    } finally {
      setClearConfirm(false)
    }
  }

  async function handleDisableAlert(script) {
    try {
      await setScriptAlert(currentUser?.uid, script.id, {
        alertAbove: null, alertBelow: null, alertEnabled: false,
      })
      await refreshWatchlist()
      toast.success(`Alert removed for ${script.scriptName}`)
    } catch {
      toast.error('Failed to remove alert')
    }
  }

  const aboveCount = firedAlerts.filter((a) => a.direction === 'above').length
  const belowCount = firedAlerts.filter((a) => a.direction === 'below').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-textPrimary flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-500/15 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            Price Alerts
          </h1>
          <p className="text-sm text-textMuted mt-0.5 ml-10.5">
            Auto-checks every 5 min during market hours · email + Telegram on breach
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadFired(); refreshWatchlist() }}
            disabled={loadingAlerts || wlLoading}
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-textMuted hover:text-textPrimary rounded-lg text-sm transition"
          >
            <RefreshCw className={clsx('w-4 h-4', (loadingAlerts || wlLoading) && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/watchlist')}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded-lg text-sm font-medium transition"
          >
            <Bell className="w-4 h-4" />
            Set Alerts
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface border border-border rounded-xl w-fit">
        {[
          { id: 'active',  label: 'Active Alerts',  count: activeAlerts.length,  color: 'text-amber-400' },
          { id: 'history', label: 'Fired History',  count: firedAlerts.length,   color: 'text-emerald-400' },
        ].map(({ id, label, count, color }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition',
              tab === id
                ? 'bg-background text-textPrimary shadow-sm'
                : 'text-textMuted hover:text-textPrimary'
            )}
          >
            {label}
            <span className={clsx(
              'min-w-[20px] px-1.5 py-0.5 rounded-full text-xs font-bold text-center',
              tab === id ? `${color} bg-current/10` : 'text-textMuted/50 bg-white/5'
            )}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Active Alerts tab ── */}
      {tab === 'active' && (
        <>
          {/* Stats */}
          {activeAlerts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Active Thresholds', value: activeAlerts.length,        color: 'text-amber-400'  },
                { label: 'Watching Above',    value: activeAlerts.filter(s => s.alertAbove != null).length,  color: 'text-emerald-400' },
                { label: 'Watching Below',    value: activeAlerts.filter(s => s.alertBelow != null).length,  color: 'text-red-400'     },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-surface border border-border rounded-xl p-4 text-center">
                  <p className={clsx('text-2xl font-bold', color)}>{value}</p>
                  <p className="text-xs text-textMuted mt-1">{label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {wlLoading ? (
              <div className="space-y-px">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-4 py-3.5 flex items-center gap-3 border-b border-border">
                    <div className="w-9 h-9 rounded-xl bg-white/5 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
                      <div className="h-2.5 w-48 bg-white/5 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activeAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                  <Bell className="w-7 h-7 text-amber-400/50" />
                </div>
                <p className="font-medium text-textPrimary mb-1">No active alerts</p>
                <p className="text-sm text-textMuted max-w-xs mb-4">
                  Open any script in your watchlist and click the <strong>bell icon</strong> to set a price threshold.
                </p>
                <button
                  onClick={() => navigate('/watchlist')}
                  className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded-lg text-sm font-medium transition"
                >
                  Go to Watchlist
                </button>
                <div className="mt-4 flex items-center gap-2 text-xs text-textMuted/60 bg-background rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Alerts fire during "Fetch Latest Data"
                </div>
              </div>
            ) : (
              activeAlerts.map((script) => (
                <ActiveAlertRow
                  key={script.id}
                  script={script}
                  rate={liveRates[script.ltdCode || script.bseCode || ''] || null}
                  onDisable={handleDisableAlert}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* ── Fired History tab ── */}
      {tab === 'history' && (
        <>
          {firedAlerts.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Fired',  value: firedAlerts.length, color: 'text-primary'      },
                  { label: 'Above Target', value: aboveCount,          color: 'text-emerald-400'  },
                  { label: 'Below Target', value: belowCount,          color: 'text-red-400'      },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-surface border border-border rounded-xl p-4 text-center">
                    <p className={clsx('text-2xl font-bold', color)}>{value}</p>
                    <p className="text-xs text-textMuted mt-1">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setClearConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-danger/30 text-danger hover:bg-danger/10 rounded-lg text-sm transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All History
                </button>
              </div>
            </>
          )}

          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {loadingAlerts ? (
              <div className="space-y-px">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="px-4 py-3.5 flex items-center gap-3 border-b border-border">
                    <div className="w-9 h-9 rounded-xl bg-white/5 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-40 bg-white/5 rounded animate-pulse" />
                      <div className="h-2.5 w-60 bg-white/5 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : firedAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400/50" />
                </div>
                <p className="font-medium text-textPrimary mb-1">No alerts fired yet</p>
                <p className="text-sm text-textMuted max-w-xs">
                  When a stock's LTP crosses your threshold during a fetch, it will appear here with timestamp and notification status.
                </p>
              </div>
            ) : (
              firedAlerts.map((alert) => (
                <FiredAlertRow key={alert.id} alert={alert} onDelete={handleDeleteFired} />
              ))
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={clearConfirm}
        title="Clear Alert History"
        message="This will permanently delete all fired alert history. Active alert thresholds are not affected."
        confirmLabel="Clear All"
        onConfirm={handleClearAll}
        onCancel={() => setClearConfirm(false)}
        danger
      />
    </div>
  )
}
