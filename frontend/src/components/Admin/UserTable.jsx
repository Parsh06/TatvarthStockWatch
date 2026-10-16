import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Search, ShieldCheck, ShieldX, UserX, UserCheck, Edit3,
  ExternalLink, ChevronUp, ChevronDown, Loader2, RefreshCw, Download
} from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { exportToCSV } from '../../utils/csvParser'
import toast from 'react-hot-toast'

/**
 * UserTable
 *
 * Searchable, sortable table of all platform users.
 *
 * Props:
 *   users        — array of enriched user objects
 *   loading      — boolean
 *   canWrite     — boolean (hide action buttons if false)
 *   onViewUser   — (user) => void  — open UserDrawer
 *   onEditRole   — (user) => void  — open RoleEditModal
 *   onDisable    — (user) => void  — open DisableUserModal
 *   onEnable     — (user) => void  — call enable API inline
 *   onRefresh    — () => void      — reload user list
 */
export default function UserTable({ users, loading, canWrite, onViewUser, onEditRole, onDisable, onEnable, onRefresh }) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [enablingUid, setEnablingUid] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = q
      ? users.filter(u =>
          (u.email || '').toLowerCase().includes(q) ||
          (u.displayName || '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
        )
      : [...users]

    list.sort((a, b) => {
      let va = a[sortKey] ?? ''
      let vb = b[sortKey] ?? ''
      if (sortKey === 'createdAt' || sortKey === 'lastSignInAt') {
        va = va ? new Date(va).getTime() : 0
        vb = vb ? new Date(vb).getTime() : 0
      }
      if (sortKey === 'watchlistCount') {
        va = va || 0; vb = vb || 0
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [users, search, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 opacity-20" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-primary" />
      : <ChevronDown className="w-3 h-3 text-primary" />
  }

  async function handleEnable(user) {
    setEnablingUid(user.uid)
    try {
      await apiClient(`/api/admin/users/${user.uid}/enable`, { method: 'PATCH' })
      toast.success('Account re-enabled')
      onEnable?.(user)
    } catch (e) {
      toast.error(e.message || 'Failed to enable')
    } finally {
      setEnablingUid(null)
    }
  }

  function handleExportCsv() {
    if (!filtered.length) {
      toast.error('No users to export')
      return
    }
    const exportData = filtered.map(u => ({
      UID: u.uid,
      Email: u.email || '',
      DisplayName: u.displayName || '',
      Role: u.role || 'user',
      ReadEntitlement: u.entitlements?.read ? 'Yes' : 'No',
      WriteEntitlement: u.entitlements?.write ? 'Yes' : 'No',
      Disabled: u.disabled ? 'Yes' : 'No',
      WatchlistCount: u.watchlistCount || 0,
      CreatedAt: u.createdAt || '',
      LastSignInAt: u.lastSignInAt || '',
    }))
    exportToCSV(exportData, `users_directory_${new Date().toISOString().split('T')[0]}.csv`)
    toast.success(`Exported ${exportData.length} users to CSV`)
  }

  return (
    <div className="space-y-4">
      {/* Search & Export bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or UID…"
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-surface border border-border text-sm text-textPrimary placeholder:text-textMuted/60 focus:outline-none focus:border-primary/40 transition"
          />
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border hover:bg-surfaceHover text-xs font-semibold text-textPrimary transition shadow-sm whitespace-nowrap"
          title="Export user directory as CSV"
        >
          <Download className="w-3.5 h-3.5 text-primary" />
          <span>Export Users (CSV)</span>
        </button>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-textMuted uppercase tracking-wider">User</th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-textMuted uppercase tracking-wider cursor-pointer hover:text-textPrimary transition"
                  onClick={() => toggleSort('role')}
                >
                  <div className="flex items-center gap-1">Role <SortIcon col="role" /></div>
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-textMuted uppercase tracking-wider cursor-pointer hover:text-textPrimary transition"
                  onClick={() => toggleSort('watchlistCount')}
                >
                  <div className="flex items-center justify-end gap-1">Watchlist <SortIcon col="watchlistCount" /></div>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-textMuted uppercase tracking-wider">Status</th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-textMuted uppercase tracking-wider cursor-pointer hover:text-textPrimary transition"
                  onClick={() => toggleSort('lastSignInAt')}
                >
                  <div className="flex items-center gap-1">Last Sign-In <SortIcon col="lastSignInAt" /></div>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-textMuted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="px-4 py-4" colSpan={6}>
                      <div className="skeleton h-8 rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-textMuted text-sm">No users found</td>
                </tr>
              ) : (
                filtered.map((user, idx) => (
                  <motion.tr
                    key={user.uid}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.025, duration: 0.2 }}
                    className="border-b border-border/30 hover:bg-surface/50 transition-colors group"
                  >
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {(user.displayName || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-textPrimary truncate max-w-[160px]">
                            {user.displayName || '—'}
                          </p>
                          <p className="text-xs text-textMuted truncate max-w-[160px]">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role + Entitlements */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={clsx(
                          'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          user.role === 'admin'
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-surface text-textMuted border-border'
                        )}>
                          {user.role === 'admin' ? <ShieldCheck className="w-2.5 h-2.5" /> : <ShieldX className="w-2.5 h-2.5" />}
                          {user.role || 'user'}
                        </span>
                        {user.role === 'admin' && (
                          <span className="text-[9px] text-textMuted/60">
                            {user.entitlements?.write ? 'R+W' : user.entitlements?.read ? 'R' : '—'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Watchlist count */}
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-textPrimary">{user.watchlistCount ?? 0}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border',
                        user.disabled
                          ? 'bg-danger/15 text-danger border-danger/30'
                          : 'bg-success/15 text-success border-success/30'
                      )}>
                        {user.disabled ? '● Disabled' : '● Active'}
                      </span>
                    </td>

                    {/* Last Sign-In */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-textMuted">
                        {user.lastSignInAt
                          ? new Date(user.lastSignInAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                          : '—'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* View */}
                        <button
                          onClick={() => onViewUser?.(user)}
                          className="p-1.5 rounded-lg text-textMuted hover:text-primary hover:bg-primary/10 transition"
                          title="View details"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        {canWrite && (
                          <>
                            {/* Edit role */}
                            <button
                              onClick={() => onEditRole?.(user)}
                              className="p-1.5 rounded-lg text-textMuted hover:text-amber-400 hover:bg-amber-500/10 transition"
                              title="Edit role"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Disable / Enable */}
                            {user.disabled ? (
                              <button
                                onClick={() => handleEnable(user)}
                                disabled={enablingUid === user.uid}
                                className="p-1.5 rounded-lg text-textMuted hover:text-success hover:bg-success/10 transition disabled:opacity-50"
                                title="Enable account"
                              >
                                {enablingUid === user.uid
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <UserCheck className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <button
                                onClick={() => onDisable?.(user)}
                                className="p-1.5 rounded-lg text-textMuted hover:text-danger hover:bg-danger/10 transition"
                                title="Disable account"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between">
            <p className="text-xs text-textMuted">
              Showing {filtered.length} of {users.length} users
              {search && ` matching "${search}"`}
            </p>
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 text-xs text-textMuted hover:text-textPrimary transition"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
