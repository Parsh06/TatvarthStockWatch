import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  History, User, Shield, Trash2, UserCheck, UserX,
  Filter, RefreshCw, Loader2, Calendar, Search, Download
} from 'lucide-react'
import clsx from 'clsx'
import { exportToCSV } from '../../utils/csvParser'
import toast from 'react-hot-toast'

const ACTION_CONFIG = {
  DISABLE_USER: {
    label: 'Disabled User',
    color: 'text-danger bg-danger/10 border-danger/30',
    icon: UserX,
  },
  ENABLE_USER: {
    label: 'Enabled User',
    color: 'text-success bg-success/10 border-success/30',
    icon: UserCheck,
  },
  SET_ROLE: {
    label: 'Changed Role',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    icon: Shield,
  },
  DELETE_WATCHLIST_ENTRY: {
    label: 'Deleted Watchlist',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    icon: Trash2,
  },
  DELETE_PUSH_DEVICE: {
    label: 'Removed Push Device',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    icon: Trash2,
  },
}

/**
 * AdminAuditTable
 *
 * Displays an immutable audit trail of all administrative actions.
 * Supports filtering by action type and free-text search (target UID, actor email, payload details).
 */
export default function AdminAuditTable({ logs = [], loading = false, onRefresh }) {
  const [actionFilter, setActionFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter !== 'ALL' && log.action !== actionFilter) return false
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase()
      return (
        (log.actorEmail || '').toLowerCase().includes(q) ||
        (log.targetUid || '').toLowerCase().includes(q) ||
        (log.actorUid || '').toLowerCase().includes(q) ||
        JSON.stringify(log.payload || {}).toLowerCase().includes(q)
      )
    })
  }, [logs, actionFilter, searchTerm])

  const handleExportCsv = () => {
    if (!filteredLogs.length) {
      toast.error('No audit records to export')
      return
    }
    const exportData = filteredLogs.map((log) => ({
      ID: log.id,
      Timestamp: log.timestamp || '',
      ActorEmail: log.actorEmail || '',
      ActorUID: log.actorUid || '',
      Action: log.action || '',
      TargetUID: log.targetUid || '',
      Payload: JSON.stringify(log.payload || {}),
    }))
    exportToCSV(exportData, `audit_trail_${new Date().toISOString().split('T')[0]}.csv`)
    toast.success(`Exported ${exportData.length} audit records to CSV`)
  }

  return (
    <div className="space-y-4">
      {/* Filters & search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by admin, target UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-textPrimary placeholder:text-textMuted/60 focus:outline-none focus:border-primary/50 transition w-56 sm:w-64"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-textMuted" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-transparent text-xs text-textPrimary focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Actions</option>
              <option value="DISABLE_USER">Account Disabled</option>
              <option value="ENABLE_USER">Account Enabled</option>
              <option value="SET_ROLE">Role / Entitlement Updated</option>
              <option value="DELETE_WATCHLIST_ENTRY">Watchlist Item Deleted</option>
              <option value="DELETE_PUSH_DEVICE">Push Device Removed</option>
              <option value="PUBLISH_SYSTEM_BROADCAST">System Broadcast Published</option>
              <option value="CLEAR_SYSTEM_BROADCAST">System Broadcast Cleared</option>
              <option value="TRIGGER_CRON_PIPELINE">Cron Pipeline Executed</option>
              <option value="MANUAL_MIDNIGHT_WIPE">Manual Midnight Wipe</option>
              <option value="FLUSH_SYSTEM_CACHE">System Cache Flushed</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-textPrimary bg-surface border border-border hover:bg-surfaceHover transition shadow-sm"
            title="Export audit log as CSV"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-textMuted hover:text-textPrimary bg-surface border border-border hover:bg-surfaceHover transition disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Table container */}
      <div className="glass-panel overflow-hidden rounded-2xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface/60 border-b border-border/40 text-textMuted font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Admin (Actor)</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target UID</th>
                <th className="px-4 py-3">Details / Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading && !logs.length ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-textMuted">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
                    Loading audit trail...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-textMuted">
                    <History className="w-8 h-8 mx-auto text-textMuted/40 mb-2" />
                    No audit log records found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const conf = ACTION_CONFIG[log.action] || {
                    label: log.action || 'Unknown',
                    color: 'text-textMuted bg-white/5 border-border',
                    icon: History,
                  }
                  const ActionIcon = conf.icon

                  return (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap text-textMuted">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-textMuted/60 flex-shrink-0" />
                          <span>
                            {log.timestamp
                              ? new Date(log.timestamp).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })
                              : '—'}
                          </span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-textMuted/60 flex-shrink-0" />
                          <span className="font-medium text-textPrimary truncate max-w-[180px]">
                            {log.actorEmail || log.actorUid || 'System'}
                          </span>
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                            conf.color
                          )}
                        >
                          <ActionIcon className="w-3 h-3" />
                          {conf.label}
                        </span>
                      </td>

                      {/* Target UID */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-textMuted">
                        {log.targetUid ? (
                          <span title={log.targetUid} className="truncate max-w-[120px] inline-block">
                            {log.targetUid.slice(0, 10)}…
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Payload / Details */}
                      <td className="px-4 py-3 text-textMuted">
                        <pre className="text-[11px] font-mono bg-black/20 dark:bg-black/40 px-2 py-1 rounded max-w-xs truncate overflow-hidden">
                          {JSON.stringify(log.payload || {})}
                        </pre>
                      </td>
                    </motion.tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredLogs.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border/30 text-[11px] text-textMuted flex items-center justify-between">
            <span>Showing {filteredLogs.length} audit records</span>
            <span>Immutable Firestore log</span>
          </div>
        )}
      </div>
    </div>
  )
}
