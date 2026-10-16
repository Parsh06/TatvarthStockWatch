import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck, Users, BarChart3, History, Cpu,
  RefreshCw, AlertCircle, Play, CheckCircle2, XCircle,
  Database, Clock, Activity, Sparkles, TrendingUp,
  Zap, Send, Trash2, Server, Globe, Bot, Terminal,
  AlertTriangle, Layers, ArrowUpRight, Check, Megaphone,
  Search, Eye, Star, Bell
} from 'lucide-react'

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts'
import clsx from 'clsx'
import toast from 'react-hot-toast'

import { useAdminAuth } from '../../hooks/useAdminAuth'
import { apiClient } from '../../services/apiClient'
import AdminStatCard from './AdminStatCard'
import ReadOnlyBadge from './ReadOnlyBadge'
import UserTable from './UserTable'
import UserDrawer from './UserDrawer'
import RoleEditModal from './RoleEditModal'
import DisableUserModal from './DisableUserModal'
import AdminAuditTable from './AdminAuditTable'

const TABS = [
  { id: 'system',    label: 'Mission Control & Services', icon: Cpu },
  { id: 'users',     label: 'Users & Access',             icon: Users },
  { id: 'analytics', label: 'Platform Analytics',         icon: BarChart3 },
  { id: 'audit',     label: 'Audit Trail',                icon: History },
]

export default function AdminPage() {
  const { canWrite, role, entitlements, refreshAdminProfile } = useAdminAuth()

  const [activeTab, setActiveTab] = useState('system')
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [servicesData, setServicesData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Service testing states
  const [testingService, setTestingService] = useState(null)
  const [testResults, setTestResults] = useState({})

  // Operations execution state
  const [executingOp, setExecutingOp] = useState(null)

  // System Broadcast state
  const [broadcast, setBroadcast] = useState({ active: false, message: '', title: '', severity: 'info' })
  const [savingBroadcast, setSavingBroadcast] = useState(false)
  const [broadcastSendPush, setBroadcastSendPush] = useState(true)


  // Reverse Watchlist search state
  const [reverseQuery, setReverseQuery] = useState('')
  const [reverseResults, setReverseResults] = useState(null)
  const [reverseLoading, setReverseLoading] = useState(false)

  // Modals & Drawer state
  const [drawerUser, setDrawerUser] = useState(null)
  const [roleModalUser, setRoleModalUser] = useState(null)
  const [disableModalUser, setDisableModalUser] = useState(null)

  // ── Data Fetching ───────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiClient('/api/admin/users?limit=200')
      if (data?.users) {
        setUsers(data.users)
      }
    } catch (err) {
      console.error('Failed to load users:', err)
      toast.error('Failed to load users list')
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiClient('/api/admin/stats')
      if (data?.stats) {
        setStats(data.stats)
      }
    } catch (err) {
      console.error('Failed to load admin stats:', err)
    }
  }, [])

  const fetchAuditLogs = useCallback(async () => {
    try {
      const data = await apiClient('/api/admin/audit-log?limit=100')
      if (data?.logs) {
        setAuditLogs(data.logs)
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    }
  }, [])

  const fetchServicesStatus = useCallback(async () => {
    try {
      const data = await apiClient('/api/admin/system/services-status')
      if (data?.services) {
        setServicesData(data.services)
      }
    } catch (err) {
      console.error('Failed to load services status:', err)
    }
  }, [])

  const fetchBroadcast = useCallback(async () => {
    try {
      const data = await apiClient('/api/admin/system/broadcast')
      if (data?.broadcast) {
        setBroadcast({
          active: Boolean(data.broadcast.active),
          message: data.broadcast.message || '',
          title: data.broadcast.title || '',
          severity: data.broadcast.severity || 'info',
        })
      }
    } catch (err) {
      console.error('Failed to load broadcast:', err)
    }
  }, [])

  const loadAllData = useCallback(async () => {
    setLoading(true)
    await Promise.allSettled([
      fetchUsers(),
      fetchStats(),
      fetchAuditLogs(),
      fetchServicesStatus(),
      fetchBroadcast(),
    ])
    setLoading(false)
  }, [fetchUsers, fetchStats, fetchAuditLogs, fetchServicesStatus, fetchBroadcast])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // ── Individual Service Test Ping ────────────────────────────────────────────

  const handleTestService = async (serviceKey) => {
    setTestingService(serviceKey)
    try {
      const res = await apiClient(`/api/admin/system/test-service/${serviceKey}`, { method: 'POST' })
      setTestResults(prev => ({
        ...prev,
        [serviceKey]: {
          success: res?.success !== false,
          latencyMs: res?.latencyMs,
          message: res?.sample || res?.response || res?.message || 'Operational',
          timestamp: new Date().toLocaleTimeString(),
        }
      }))
      if (res?.success !== false) {
        toast.success(`${serviceKey.toUpperCase()} verified (${res?.latencyMs ?? 0}ms)`)
      } else {
        toast.error(`${serviceKey.toUpperCase()} warning: ${res?.message || 'Check logs'}`)
      }
      fetchServicesStatus()
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [serviceKey]: {
          success: false,
          error: err.message,
          timestamp: new Date().toLocaleTimeString(),
        }
      }))
      toast.error(`Test ${serviceKey.toUpperCase()} failed: ${err.message}`)
    } finally {
      setTestingService(null)
    }
  }

  // ── Operational Control Actions ─────────────────────────────────────────────

  const handleRunPipeline = async () => {
    if (!canWrite) return toast.error('Write entitlement required')
    setExecutingOp('pipeline')
    try {
      const res = await apiClient('/api/trigger', { method: 'POST' })
      toast.success(`Market fetch complete: ${res?.newAnnouncements ?? 0} new announcements`)
      fetchStats()
      fetchServicesStatus()
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Pipeline trigger failed')
    } finally {
      setExecutingOp(null)
    }
  }

  const handleTriggerCron = async () => {
    if (!canWrite) return toast.error('Write entitlement required')
    setExecutingOp('cron')
    try {
      const res = await apiClient('/api/admin/system/trigger-cron', { method: 'POST' })
      toast.success(res?.message || 'Global cron executed successfully')
      fetchStats()
      fetchServicesStatus()
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Cron execution failed')
    } finally {
      setExecutingOp(null)
    }
  }

  const handleTriggerWipe = async () => {
    if (!canWrite) return toast.error('Write entitlement required')
    if (!window.confirm('Are you sure you want to trigger a manual daily wipe? This will purge today’s transient announcements and dedup locks from MongoDB.')) {
      return
    }
    setExecutingOp('wipe')
    try {
      const res = await apiClient('/api/admin/system/trigger-wipe', { method: 'POST' })
      toast.success(`Wipe complete: ${res?.announcementsDeleted ?? 0} announcements purged`)
      fetchStats()
      fetchServicesStatus()
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Manual wipe failed')
    } finally {
      setExecutingOp(null)
    }
  }

  const handleFlushCache = async () => {
    if (!canWrite) return toast.error('Write entitlement required')
    setExecutingOp('cache')
    try {
      const res = await apiClient('/api/admin/system/flush-cache', { method: 'POST' })
      toast.success(res?.message || 'Cache flushed')
      fetchServicesStatus()
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Cache flush failed')
    } finally {
      setExecutingOp(null)
    }
  }

  const handleTestPush = async () => {
    if (!canWrite) return toast.error('Write entitlement required')
    setExecutingOp('push')
    try {
      const res = await apiClient('/api/admin/system/test-push', { method: 'POST' })
      if (res?.success) {
        toast.success(res.message || 'Push alert dispatched!')
      } else {
        toast.error(res?.error || 'Failed to dispatch push notification')
      }
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Push test failed')
    } finally {
      setExecutingOp(null)
    }
  }

  const handleExportBackup = async () => {
    setExecutingOp('backup')
    try {
      const data = await apiClient('/api/admin/system/export-backup')
      if (data?.users) {
        const jsonStr = JSON.stringify(data, null, 2)
        const blob = new Blob([jsonStr], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `stockwatch_users_backup_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`Exported snapshot of ${data.totalUsers} users`)
      }
      fetchAuditLogs()
    } catch (err) {
      toast.error('Backup export failed: ' + err.message)
    } finally {
      setExecutingOp(null)
    }
  }

  const handleSaveBroadcast = async (newActiveState) => {
    if (!canWrite) return toast.error('Write entitlement required')
    setSavingBroadcast(true)
    try {
      const targetActive = newActiveState !== undefined ? newActiveState : broadcast.active
      const payload = {
        active: targetActive,
        message: broadcast.message,
        title: broadcast.title,
        severity: broadcast.severity,
        sendPush: broadcastSendPush,
      }
      const data = await apiClient('/api/admin/system/broadcast', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setBroadcast(prev => ({ ...prev, active: payload.active }))
      if (payload.active) {
        const sent = data?.pushStats?.sent || 0
        const total = data?.pushStats?.totalDevices || 0
        if (total > 0 && broadcastSendPush) {
          toast.success(`Broadcast published! Sent push alert to ${sent}/${total} registered device(s).`)
        } else {
          toast.success('System broadcast banner published live across all active user sessions.')
        }
      } else {
        toast.success('System broadcast banner deactivated')
      }
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Failed to update broadcast')
    } finally {
      setSavingBroadcast(false)
    }
  }


  const handleSearchWatchlist = async (e) => {
    e?.preventDefault()
    if (!reverseQuery.trim()) return
    setReverseLoading(true)
    try {
      const data = await apiClient(`/api/admin/watchlists/search?q=${encodeURIComponent(reverseQuery.trim())}`)
      setReverseResults(data)
    } catch (err) {
      toast.error('Search failed: ' + err.message)
    } finally {
      setReverseLoading(false)
    }
  }

  const handleEnableUser = async (targetUser) => {
    if (!canWrite) {
      toast.error('Write entitlement required to modify accounts')
      return
    }
    try {
      await apiClient(`/api/admin/users/${targetUser.uid}/enable`, { method: 'PATCH' })
      toast.success(`Account for ${targetUser.email || targetUser.uid} re-enabled`)
      fetchUsers()
      fetchStats()
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Failed to enable account')
    }
  }

  const handleApproveUser = async (targetUser) => {
    if (!canWrite) {
      toast.error('Write entitlement required to approve access')
      return
    }
    try {
      await apiClient(`/api/admin/users/${targetUser.uid}/approve`, { method: 'PATCH' })
      toast.success(`Access approved for ${targetUser.displayName || targetUser.email || targetUser.uid}`)
      fetchUsers()
      fetchStats()
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Failed to approve account')
    }
  }

  const handleRejectUser = async () => {
    fetchUsers()
    fetchStats()
    fetchAuditLogs()
  }

  const handleReAllowUser = async (targetUser) => {
    if (!canWrite) {
      toast.error('Write entitlement required to re-allow access')
      return
    }
    try {
      await apiClient(`/api/admin/users/${targetUser.uid}/re-allow`, { method: 'PATCH' })
      toast.success(`Account re-allowed and approved for ${targetUser.displayName || targetUser.email || targetUser.uid}`)
      fetchUsers()
      fetchStats()
      fetchAuditLogs()
    } catch (err) {
      toast.error(err.message || 'Failed to re-allow account')
    }
  }

  // ── Compute High-Level Health Status ────────────────────────────────────────
  const servicesList = servicesData ? Object.entries(servicesData) : []
  const failingCount = servicesList.filter(([_, s]) => s.status === 'down').length
  const degradedCount = servicesList.filter(([_, s]) => s.status === 'degraded' || s.status === 'blocked').length
  const healthyCount = servicesList.filter(([_, s]) => s.status === 'healthy').length

  return (
    <div className="space-y-6 pb-12">
      {/* ── Top Header & Global Status Ribbon ──────────────────────────────── */}
      <div className="glass-panel p-6 rounded-3xl border border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-amber-500/25 to-primary/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/10">
              <ShieldCheck className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold font-display text-textPrimary tracking-tight">
                  StockWatch Mission Control
                </h1>
                <ReadOnlyBadge canWrite={canWrite} />
              </div>
              <div className="flex items-center gap-3 text-xs text-textMuted mt-1 flex-wrap">
                <span>
                  Admin Role: <strong className="text-amber-400 capitalize">{role}</strong>
                </span>
                <span>•</span>
                <span>
                  Entitlements:{' '}
                  <span className="font-mono text-[11px] text-textPrimary bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                    Read: {String(entitlements?.read)} | Write: {String(entitlements?.write)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Status Overview & Refresh */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold backdrop-blur-md',
              failingCount > 0
                ? 'bg-danger/10 border-danger/30 text-danger'
                : degradedCount > 0
                ? 'bg-warning/10 border-warning/30 text-warning'
                : 'bg-success/10 border-success/30 text-success'
            )}>
              <span className={clsx(
                'w-2 h-2 rounded-full animate-ping',
                failingCount > 0 ? 'bg-danger' : degradedCount > 0 ? 'bg-warning' : 'bg-success'
              )} />
              <span>
                {failingCount > 0
                  ? `${failingCount} Service Failing`
                  : degradedCount > 0
                  ? `${degradedCount} Service Degraded`
                  : 'All Systems Operational'}
              </span>
            </div>

            <button
              onClick={loadAllData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-textPrimary bg-surface border border-border hover:bg-surfaceHover transition disabled:opacity-50 shadow-sm"
              title="Refresh all metrics and diagnostics"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
              <span>Sync All</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border/40 pb-2 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all duration-200 relative',
                isActive
                  ? 'text-primary bg-primary/10 shadow-sm'
                  : 'text-textMuted hover:text-textPrimary hover:bg-white/5'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{tab.label}</span>
              {tab.id === 'users' && (
                <div className="flex items-center gap-1.5">
                  {users.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-primary/20 text-primary">
                      {users.length}
                    </span>
                  )}
                  {users.some(u => u.approvalStatus === 'pending' && u.role !== 'admin') && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400 animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {users.filter(u => u.approvalStatus === 'pending' && u.role !== 'admin').length} pending
                    </span>
                  )}
                </div>
              )}
              {tab.id === 'system' && (failingCount > 0 || degradedCount > 0) && (
                <span className={clsx(
                  'w-2 h-2 rounded-full',
                  failingCount > 0 ? 'bg-danger animate-pulse' : 'bg-warning'
                )} />
              )}
              {isActive && (
                <motion.div
                  layoutId="adminTabIndicator"
                  className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab 1: Mission Control & Services ───────────────────────────────── */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          {/* Operations Command Bar */}
          <div className="glass-panel p-6 rounded-3xl border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/30 pb-3">
              <div>
                <h3 className="text-base font-bold font-display text-textPrimary flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  Administrative Operations Command Deck
                </h3>
                <p className="text-xs text-textMuted mt-0.5">
                  Execute backend pipeline jobs, purge caches, or trigger synchronization across BSE & NSE
                </p>
              </div>
              {!canWrite && (
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-medium">
                  Read-Only Mode
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {/* Trigger Pipeline */}
              <button
                onClick={handleRunPipeline}
                disabled={!canWrite || executingOp !== null}
                className={clsx(
                  'flex flex-col gap-1 p-4 rounded-2xl border text-left transition-all',
                  canWrite
                    ? 'bg-surface hover:bg-surfaceHover border-border hover:border-primary/50 group'
                    : 'bg-surface/50 opacity-60 cursor-not-allowed border-border'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-textPrimary group-hover:text-primary transition-colors flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-primary" />
                    Market Scraper
                  </span>
                  {executingOp === 'pipeline' && <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />}
                </div>
                <span className="text-[11px] text-textMuted">Fetch BSE+NSE announcements & alerts</span>
              </button>

              {/* Trigger Global Cron */}
              <button
                onClick={handleTriggerCron}
                disabled={!canWrite || executingOp !== null}
                className={clsx(
                  'flex flex-col gap-1 p-4 rounded-2xl border text-left transition-all',
                  canWrite
                    ? 'bg-surface hover:bg-surfaceHover border-border hover:border-amber-500/50 group'
                    : 'bg-surface/50 opacity-60 cursor-not-allowed border-border'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-textPrimary group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Global Cron Tick
                  </span>
                  {executingOp === 'cron' && <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />}
                </div>
                <span className="text-[11px] text-textMuted">Run complete scheduled maintenance tick</span>
              </button>

              {/* Flush Cache */}
              <button
                onClick={handleFlushCache}
                disabled={!canWrite || executingOp !== null}
                className={clsx(
                  'flex flex-col gap-1 p-4 rounded-2xl border text-left transition-all',
                  canWrite
                    ? 'bg-surface hover:bg-surfaceHover border-border hover:border-accent-teal/50 group'
                    : 'bg-surface/50 opacity-60 cursor-not-allowed border-border'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-textPrimary group-hover:text-accent-teal transition-colors flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-accent-teal" />
                    Flush Cache
                  </span>
                  {executingOp === 'cache' && <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent-teal" />}
                </div>
                <span className="text-[11px] text-textMuted">Clear rate-limit keys & live rates cache</span>
              </button>

              {/* Daily Wipe */}
              <button
                onClick={handleTriggerWipe}
                disabled={!canWrite || executingOp !== null}
                className={clsx(
                  'flex flex-col gap-1 p-4 rounded-2xl border text-left transition-all',
                  canWrite
                    ? 'bg-surface hover:bg-surfaceHover border-border hover:border-danger/50 group'
                    : 'bg-surface/50 opacity-60 cursor-not-allowed border-border'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-danger flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                    Reset Daily Data
                  </span>
                  {executingOp === 'wipe' && <RefreshCw className="w-3.5 h-3.5 animate-spin text-danger" />}
                </div>
                <span className="text-[11px] text-textMuted">Purge today announcements & locks</span>
              </button>

              {/* Test Web Push */}
              <button
                onClick={handleTestPush}
                disabled={!canWrite || executingOp !== null}
                className={clsx(
                  'flex flex-col gap-1 p-4 rounded-2xl border text-left transition-all',
                  canWrite
                    ? 'bg-surface hover:bg-surfaceHover border-border hover:border-primary/50 group'
                    : 'bg-surface/50 opacity-60 cursor-not-allowed border-border'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-textPrimary group-hover:text-primary transition-colors flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-primary" />
                    Test Web Push
                  </span>
                  {executingOp === 'push' && <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />}
                </div>
                <span className="text-[11px] text-textMuted">Dispatch VAPID test alert to devices</span>
              </button>

              {/* Database Snapshot / Backup */}
              <button
                onClick={handleExportBackup}
                disabled={executingOp !== null}
                className="flex flex-col gap-1 p-4 rounded-2xl border text-left transition-all bg-surface hover:bg-surfaceHover border-border hover:border-success/50 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-textPrimary group-hover:text-success transition-colors flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-success" />
                    Backup DB
                  </span>
                  {executingOp === 'backup' && <RefreshCw className="w-3.5 h-3.5 animate-spin text-success" />}
                </div>
                <span className="text-[11px] text-textMuted">Export complete users & watchlists JSON</span>
              </button>
            </div>
          </div>

          {/* System Announcement & Broadcast Manager */}
          <div className="glass-panel p-6 rounded-3xl border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/30 pb-3">
              <div>
                <h3 className="text-base font-bold font-display text-textPrimary flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-400" />
                  Global System Announcement & Maintenance Banner
                </h3>
                <p className="text-xs text-textMuted mt-0.5">
                  Broadcast an instant alert or banner to all active user sessions (trading holidays, maintenance, news)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'px-2.5 py-1 rounded-full text-[11px] font-semibold border',
                  broadcast.active ? 'bg-success/15 border-success/30 text-success' : 'bg-surface border-border text-textMuted'
                )}>
                  {broadcast.active ? 'Live Broadcast Active' : 'Broadcast Inactive'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider block mb-1">
                      Header / Tag
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. NOTICE, HOLIDAY"
                      value={broadcast.title}
                      onChange={e => setBroadcast(prev => ({ ...prev, title: e.target.value }))}
                      disabled={!canWrite}
                      className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-textPrimary focus:outline-none focus:border-primary/50 transition disabled:opacity-50"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider block mb-1">
                      Severity Style
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['info', 'warning', 'urgent', 'success'].map((sev) => (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setBroadcast(prev => ({ ...prev, severity: sev }))}
                          disabled={!canWrite}
                          className={clsx(
                            'px-2.5 py-1.5 rounded-xl text-xs font-semibold capitalize border transition',
                            broadcast.severity === sev
                              ? sev === 'urgent' ? 'bg-danger/20 border-danger text-danger'
                              : sev === 'warning' ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                              : sev === 'success' ? 'bg-success/20 border-success text-success'
                              : 'bg-primary/20 border-primary text-primary'
                              : 'bg-surface border-border text-textMuted hover:text-textPrimary'
                          )}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider block mb-1">
                    Announcement Message
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Indian Equity Markets will remain closed on Friday on account of holiday."
                    value={broadcast.message}
                    onChange={e => setBroadcast(prev => ({ ...prev, message: e.target.value }))}
                    disabled={!canWrite}
                    className="w-full px-3.5 py-2.5 text-xs bg-surface border border-border rounded-xl text-textPrimary focus:outline-none focus:border-primary/50 transition disabled:opacity-50"
                  />
                </div>

                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={broadcastSendPush}
                      onChange={e => setBroadcastSendPush(e.target.checked)}
                      disabled={!canWrite}
                      className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs text-textPrimary flex items-center gap-1.5 font-medium">
                      <Bell className="w-3.5 h-3.5 text-sky-400" />
                      Dispatch Web Push alert to all registered devices
                    </span>
                  </label>
                </div>
              </div>


              {/* Preview & Action Buttons */}
              <div className="glass-panel p-4 rounded-2xl border border-border flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[11px] font-semibold text-textMuted uppercase tracking-wider block mb-2">
                    Live Client Preview
                  </span>
                  <div className={clsx(
                    'p-2.5 rounded-xl border text-xs',
                    broadcast.severity === 'urgent' ? 'bg-danger/10 border-danger/30 text-danger'
                    : broadcast.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : broadcast.severity === 'success' ? 'bg-success/10 border-success/30 text-success'
                    : 'bg-primary/10 border-primary/30 text-primary'
                  )}>
                    <strong className="uppercase mr-1">{broadcast.title || 'ALERT'}:</strong>
                    <span className="text-textPrimary">{broadcast.message || 'Announcement message preview appears here...'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                  <button
                    onClick={() => handleSaveBroadcast(true)}
                    disabled={!canWrite || savingBroadcast || !broadcast.message.trim()}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-blue-600 transition disabled:opacity-50 shadow-sm"
                  >
                    {savingBroadcast ? 'Publishing...' : 'Publish Live'}
                  </button>
                  {broadcast.active && (
                    <button
                      onClick={() => handleSaveBroadcast(false)}
                      disabled={!canWrite || savingBroadcast}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-surface border border-border hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition text-textMuted"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Service Health Cards Grid */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold font-display text-textPrimary flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Live Subsystem & Gateway Diagnostic Matrix
                </h3>
                <p className="text-xs text-textMuted">
                  Real-time status, round-trip latency, and on-demand connectivity test for every service
                </p>
              </div>
              <span className="text-xs font-mono text-textMuted">
                {healthyCount} Operational / {servicesList.length} Monitored
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 1. BSE Scraper */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-textPrimary">BSE Corporate Scraper</span>
                    </div>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                      servicesData?.bse?.status === 'healthy' ? 'bg-success/15 border-success/30 text-success' : 'bg-danger/15 border-danger/30 text-danger'
                    )}>
                      {servicesData?.bse?.status || 'Checking'}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    Corporate announcements, board meetings & volume spurts from api.bseindia.com
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>Status Code:</span>
                      <span className="text-textPrimary">{servicesData?.bse?.statusCode ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Round-trip Latency:</span>
                      <span className="text-textPrimary">{servicesData?.bse?.latencyMs ? `${servicesData.bse.latencyMs}ms` : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[11px] text-textMuted">
                    {testResults.bse ? `${testResults.bse.message} (${testResults.bse.latencyMs}ms)` : 'Auto-monitored'}
                  </span>
                  <button
                    onClick={() => handleTestService('bse')}
                    disabled={testingService === 'bse'}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingService === 'bse' ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Test Ping'}
                  </button>
                </div>
              </div>

              {/* 2. NSE Scraper */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-textPrimary">NSE Corporate Scraper</span>
                    </div>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                      servicesData?.nse?.status === 'healthy' ? 'bg-success/15 border-success/30 text-success' : 'bg-warning/15 border-warning/30 text-warning'
                    )}>
                      {servicesData?.nse?.status || 'Checking'}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    NSE circulars, corporate actions & indices from nseindia.com
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>Status Code:</span>
                      <span className="text-textPrimary">{servicesData?.nse?.statusCode ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Round-trip Latency:</span>
                      <span className="text-textPrimary">{servicesData?.nse?.latencyMs ? `${servicesData.nse.latencyMs}ms` : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[11px] text-textMuted">
                    {testResults.nse ? `${testResults.nse.message} (${testResults.nse.latencyMs}ms)` : 'Auto-monitored'}
                  </span>
                  <button
                    onClick={() => handleTestService('nse')}
                    disabled={testingService === 'nse'}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingService === 'nse' ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Test Ping'}
                  </button>
                </div>
              </div>

              {/* 3. AI Summarizer */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-accent-teal" />
                      <span className="text-xs font-bold text-textPrimary">AI Summarizer Engine</span>
                    </div>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                      servicesData?.ai?.status === 'healthy' ? 'bg-success/15 border-success/30 text-success' : 'bg-warning/15 border-warning/30 text-warning'
                    )}>
                      {servicesData?.ai?.status || 'Checking'}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    Gemini multimodal cascade + Groq failover engine
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>Gemini API:</span>
                      <span className="text-textPrimary">{servicesData?.ai?.details?.geminiConfigured ? 'Active' : 'Unconfigured'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Groq Failover:</span>
                      <span className="text-textPrimary">{servicesData?.ai?.details?.groqConfigured ? 'Active' : 'Unconfigured'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cooldown:</span>
                      <span className="text-textPrimary">
                        {servicesData?.ai?.details?.geminiCooldownActive ? `${servicesData.ai.details.geminiCooldownRemainingSec}s` : 'None'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[11px] text-textMuted truncate max-w-[140px]">
                    {testResults.ai ? `Provider: ${testResults.ai.message}` : 'Multi-model cascade'}
                  </span>
                  <button
                    onClick={() => handleTestService('ai')}
                    disabled={testingService === 'ai'}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingService === 'ai' ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Test Inference'}
                  </button>
                </div>
              </div>

              {/* 4. MongoDB Atlas */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-textPrimary">MongoDB Atlas</span>
                    </div>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                      servicesData?.mongodb?.status === 'healthy' ? 'bg-success/15 border-success/30 text-success' : 'bg-danger/15 border-danger/30 text-danger'
                    )}>
                      {servicesData?.mongodb?.status || 'Checking'}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    Transient daily announcements, watchlists & IPO symbol cache
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>Today Announcements:</span>
                      <span className="text-textPrimary">{servicesData?.mongodb?.details?.announcements ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Watchlist Entries:</span>
                      <span className="text-textPrimary">{servicesData?.mongodb?.details?.watchlists ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Latency:</span>
                      <span className="text-textPrimary">{servicesData?.mongodb?.latencyMs ? `${servicesData.mongodb.latencyMs}ms` : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[11px] text-textMuted">Cluster Connected</span>
                  <button
                    onClick={() => handleTestService('mongo')}
                    disabled={testingService === 'mongo'}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingService === 'mongo' ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Test Ping'}
                  </button>
                </div>
              </div>

              {/* 5. Google Cloud Firestore */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-textPrimary">Google Cloud Firestore</span>
                    </div>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                      servicesData?.firestore?.status === 'healthy' ? 'bg-success/15 border-success/30 text-success' : 'bg-danger/15 border-danger/30 text-danger'
                    )}>
                      {servicesData?.firestore?.status || 'Checking'}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    Persistent user accounts, push device tokens & security audit log
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>Project ID:</span>
                      <span className="text-textPrimary truncate max-w-[120px]">{servicesData?.firestore?.details?.projectId ?? 'tatvarthstockwatch'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Audit Trail:</span>
                      <span className="text-textPrimary">{auditLogs.length} Records</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Latency:</span>
                      <span className="text-textPrimary">{servicesData?.firestore?.latencyMs ? `${servicesData.firestore.latencyMs}ms` : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[11px] text-textMuted">RBAC Security Rules</span>
                  <span className="text-[11px] font-medium text-success flex items-center gap-1">
                    <Check className="w-3 h-3" /> Protected
                  </span>
                </div>
              </div>

              {/* 6. Upstash Redis */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-rose-400" />
                      <span className="text-xs font-bold text-textPrimary">Upstash Redis</span>
                    </div>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                      servicesData?.redis?.status === 'healthy' ? 'bg-success/15 border-success/30 text-success' : 'bg-surface text-textMuted border-border'
                    )}>
                      {servicesData?.redis?.status || 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    Distributed rate limiting & entitlement caching
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className="text-textPrimary">{servicesData?.redis?.details?.enabled ? 'Active' : 'In-Memory Fallback'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Latency:</span>
                      <span className="text-textPrimary">{servicesData?.redis?.latencyMs ? `${servicesData.redis.latencyMs}ms` : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[11px] text-textMuted">
                    {testResults.redis ? `Ping: ${testResults.redis.message}` : 'Global Limiting'}
                  </span>
                  <button
                    onClick={() => handleTestService('redis')}
                    disabled={testingService === 'redis'}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingService === 'redis' ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Test Ping'}
                  </button>
                </div>
              </div>

              {/* 7. Telegram Notifier Bot */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-bold text-textPrimary">Telegram Notifier Bot</span>
                    </div>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                      servicesData?.telegram?.status === 'healthy' ? 'bg-success/15 border-success/30 text-success' : 'bg-surface text-textMuted border-border'
                    )}>
                      {servicesData?.telegram?.status || 'Unconfigured'}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    Pushing instant market announcements & IPO alerts to Telegram
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>Bot Token:</span>
                      <span className="text-textPrimary">{servicesData?.telegram?.details?.hasBotToken ? 'Configured' : 'Missing'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Default Channel:</span>
                      <span className="text-textPrimary">{servicesData?.telegram?.details?.hasChatId ? 'Configured' : 'Optional'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[11px] text-textMuted">Live Dispatcher</span>
                  <button
                    onClick={() => handleTestService('telegram')}
                    disabled={testingService === 'telegram'}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingService === 'telegram' ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Send Test Msg'}
                  </button>
                </div>
              </div>

              {/* 8. IPO Registrars Gateways */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-textPrimary">IPO Registrar Gateways</span>
                    </div>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                      servicesData?.registrars?.status === 'healthy' ? 'bg-success/15 border-success/30 text-success' : 'bg-warning/15 border-warning/30 text-warning'
                    )}>
                      {servicesData?.registrars?.status || 'Checking'}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    Allotment query gateways: Link Intime, KFintech & BigShare
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>Link Intime (MUFG):</span>
                      <span className="text-textPrimary capitalize">{servicesData?.registrars?.details?.linkIntime ?? 'operational'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>KFintech Portal:</span>
                      <span className="text-textPrimary capitalize">{servicesData?.registrars?.details?.kfintech ?? 'operational'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>BigShare Pool:</span>
                      <span className="text-textPrimary capitalize">{servicesData?.registrars?.details?.bigshare ?? 'operational'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between text-xs text-textMuted">
                  <span>3-Way Verification</span>
                  <span className="text-success text-[11px] font-medium">Automatic Failover</span>
                </div>
              </div>

              {/* 9. Market Cadence & Runtime */}
              <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-textPrimary">Market Cadence & Host</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-success/15 border-success/30 text-success">
                      Active IST
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mb-3">
                    Intelligent cadence scheduling based on Indian Market trading hours
                  </p>
                  <div className="text-[11px] font-mono text-textMuted space-y-1 bg-surface p-2.5 rounded-xl border border-border mb-3">
                    <div className="flex justify-between">
                      <span>IST Time:</span>
                      <span className="text-textPrimary">{servicesData?.cadence?.details?.currentTimeIST ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cadence Window:</span>
                      <span className="text-textPrimary truncate max-w-[120px]">{servicesData?.cadence?.details?.window ?? 'ACTIVE'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>RAM (Heap / RSS):</span>
                      <span className="text-textPrimary">
                        {servicesData?.runtime?.details?.heapUsedMb ?? 0}MB / {servicesData?.runtime?.details?.rssMb ?? 0}MB
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between text-xs text-textMuted">
                  <span>Node: {servicesData?.runtime?.details?.nodeVersion ?? '—'}</span>
                  <span>Uptime: {Math.floor((servicesData?.runtime?.details?.uptimeSeconds ?? 0) / 60)}m</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2: Users & Access Management ────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AdminStatCard
              label="Total Users"
              value={stats?.totalUsers ?? users.length}
              sub="Registered accounts"
              icon={Users}
              color="text-primary"
              loading={loading}
            />
            <AdminStatCard
              label="Active Accounts"
              value={stats?.activeUsers ?? users.filter(u => !u.disabled).length}
              sub="Operational sessions"
              icon={CheckCircle2}
              color="text-success"
              loading={loading}
            />
            <AdminStatCard
              label="Disabled Users"
              value={stats?.disabledUsers ?? users.filter(u => u.disabled).length}
              sub="Blocked access"
              icon={XCircle}
              color="text-danger"
              loading={loading}
            />
            <AdminStatCard
              label="Admin Staff"
              value={stats?.adminUsers ?? users.filter(u => u.role === 'admin').length}
              sub="Privileged roles"
              icon={ShieldCheck}
              color="text-amber-400"
              loading={loading}
            />
          </div>

          {/* Cross-User Watchlist Intelligence (Reverse Script Search) */}
          <div className="glass-panel p-6 rounded-3xl border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border/30 pb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold font-display text-textPrimary flex items-center gap-2">
                  <Star className="w-4 h-4 text-warning" />
                  Cross-User Watchlist Inspector (Reverse Equity Search)
                </h3>
                <p className="text-xs text-textMuted mt-0.5">
                  Find which users are tracking any BSE scrip code, NSE symbol, or company name across the entire database
                </p>
              </div>
            </div>

            <form onSubmit={handleSearchWatchlist} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Enter Scrip Code (e.g. 500570) or Symbol / Name (e.g. TATA, RELIANCE)..."
                  value={reverseQuery}
                  onChange={e => setReverseQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-surface border border-border rounded-xl text-textPrimary focus:outline-none focus:border-primary/50 transition"
                />
              </div>
              <button
                type="submit"
                disabled={reverseLoading || !reverseQuery.trim()}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {reverseLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                <span>Inspect</span>
              </button>
            </form>

            {reverseResults && (
              <div className="mt-3 bg-surface rounded-2xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border/40 text-xs font-semibold text-textPrimary flex justify-between items-center bg-white/[0.02]">
                  <span>
                    Found {reverseResults.count} watchlist entries across {reverseResults.distinctUsers} distinct users
                  </span>
                  <button
                    onClick={() => setReverseResults(null)}
                    className="text-[11px] text-textMuted hover:text-textPrimary"
                  >
                    Clear Results
                  </button>
                </div>
                {reverseResults.results.length === 0 ? (
                  <p className="text-xs text-textMuted text-center py-6">No users are currently tracking this equity</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[11px] uppercase tracking-wider text-textMuted border-b border-border/30 bg-surface/50">
                        <tr>
                          <th className="px-4 py-2">User Email</th>
                          <th className="px-4 py-2">Stock Name</th>
                          <th className="px-4 py-2">Scrip Code</th>
                          <th className="px-4 py-2">Exchange</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {reverseResults.results.map((r, i) => (
                          <tr key={i} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 font-medium text-textPrimary">{r.userEmail}</td>
                            <td className="px-4 py-2.5 text-textPrimary">{r.scriptName}</td>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-textMuted">{r.ltdCode || '—'}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10">
                                {r.exchange}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Table Component */}
          <UserTable
            users={users}
            loading={loading}
            canWrite={canWrite}
            onViewUser={(u) => setDrawerUser(u)}
            onEditRole={(u) => setRoleModalUser(u)}
            onDisable={(u) => setDisableModalUser(u)}
            onEnable={handleEnableUser}
            onApprove={handleApproveUser}
            onReject={handleRejectUser}
            onReAllow={handleReAllowUser}
            onRefresh={fetchUsers}
          />
        </div>
      )}

      {/* ── Tab 3: Platform Analytics ───────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AdminStatCard
              label="Total Watchlists"
              value={stats?.watchlistCount ?? '—'}
              sub="Monitored scripts"
              icon={TrendingUp}
              color="text-primary"
              loading={loading}
            />
            <AdminStatCard
              label="Avg Watchlist / User"
              value={stats?.avgWatchlistSize ?? '—'}
              sub="Scripts per account"
              icon={BarChart3}
              color="text-accent-teal"
              loading={loading}
            />
            <AdminStatCard
              label="Today's Announcements"
              value={stats?.announcementCount ?? '—'}
              sub="Captured market feeds"
              icon={Activity}
              color="text-warning"
              loading={loading}
            />
            <AdminStatCard
              label="Admin Actions Today"
              value={stats?.adminActionsToday ?? 0}
              sub="Audit events logged"
              icon={History}
              color="text-purple-400"
              loading={loading}
            />
          </div>

          {/* Top Watchlisted Scripts & User Health */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold font-display text-textPrimary">Top Watchlisted Equities</h3>
                  <p className="text-xs text-textMuted">Most frequently monitored stocks across all user portfolios</p>
                </div>
                <span className="text-[11px] font-mono text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-lg">
                  Top 10
                </span>
              </div>

              {stats?.topScripts?.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.topScripts}
                      margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                    >
                      <XAxis
                        dataKey="scriptName"
                        stroke="#71717a"
                        fontSize={10}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                      />
                      <YAxis stroke="#71717a" fontSize={10} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#18181b',
                          borderColor: '#27272a',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#fafafa',
                        }}
                      />
                      <Bar dataKey="count" fill="#3B82F6" radius={[6, 6, 0, 0]}>
                        {stats.topScripts.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={index === 0 ? '#38E1C6' : index < 3 ? '#3B82F6' : '#60A5FA'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-xs text-textMuted">
                  No script tracking data available yet
                </div>
              )}
            </div>

            {/* User Breakdown Card */}
            <div className="glass-panel p-6 rounded-3xl border border-border flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold font-display text-textPrimary mb-1">User Base Health</h3>
                <p className="text-xs text-textMuted mb-6">Distribution and privilege density</p>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-textMuted">Active Accounts</span>
                      <span className="font-semibold text-success font-mono">
                        {stats?.totalUsers ? Math.round(((stats.activeUsers || 0) / stats.totalUsers) * 100) : 100}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface border border-border overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full"
                        style={{
                          width: `${stats?.totalUsers ? Math.round(((stats.activeUsers || 0) / stats.totalUsers) * 100) : 100}%`
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-textMuted">Disabled Accounts</span>
                      <span className="font-semibold text-danger font-mono">
                        {stats?.totalUsers ? Math.round(((stats.disabledUsers || 0) / stats.totalUsers) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface border border-border overflow-hidden">
                      <div
                        className="h-full bg-danger rounded-full"
                        style={{
                          width: `${stats?.totalUsers ? Math.round(((stats.disabledUsers || 0) / stats.totalUsers) * 100) : 0}%`
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-textMuted">Admin Density</span>
                      <span className="font-semibold text-amber-400 font-mono">
                        {stats?.adminUsers ?? 0} Staff
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface border border-border overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full"
                        style={{
                          width: `${stats?.totalUsers ? Math.min(100, Math.round(((stats.adminUsers || 0) / stats.totalUsers) * 100)) : 10}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border/40 mt-6 text-xs text-textMuted flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                <span>Live aggregation from MongoDB Atlas & Firebase Auth</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 4: Audit Trail ─────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <AdminAuditTable
          logs={auditLogs}
          loading={loading}
          onRefresh={fetchAuditLogs}
        />
      )}

      {/* ── Slide-over User Detail Drawer ───────────────────────────────────── */}
      <AnimatePresence>
        {drawerUser && (
          <UserDrawer
            user={drawerUser}
            canWrite={canWrite}
            onClose={() => setDrawerUser(null)}
            onUpdate={() => {
              fetchUsers()
              fetchStats()
              fetchAuditLogs()
            }}
            onDeleteWatchlist={() => {
              fetchUsers()
              fetchStats()
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Role & Entitlement Edit Modal ───────────────────────────────────── */}
      <AnimatePresence>
        {roleModalUser && (
          <RoleEditModal
            user={roleModalUser}
            canWrite={canWrite}
            onClose={() => setRoleModalUser(null)}
            onSuccess={() => {
              setRoleModalUser(null)
              fetchUsers()
              fetchStats()
              fetchAuditLogs()
              refreshAdminProfile()
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Disable User Account Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {disableModalUser && (
          <DisableUserModal
            user={disableModalUser}
            canWrite={canWrite}
            onClose={() => setDisableModalUser(null)}
            onSuccess={() => {
              setDisableModalUser(null)
              fetchUsers()
              fetchStats()
              fetchAuditLogs()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
