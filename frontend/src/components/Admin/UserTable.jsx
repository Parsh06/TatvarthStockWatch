import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Search, ShieldCheck, ShieldX, UserX, UserCheck, Edit3,
  ExternalLink, ChevronUp, ChevronDown, Loader2, RefreshCw, Download,
  CheckCircle2, XCircle, Clock, ShieldAlert, AlertCircle, Crown
} from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import { exportToCSV } from '../../utils/csvParser'
import RejectUserModal from './RejectUserModal'
import toast from 'react-hot-toast'

/**
 * UserTable
 *
 * Searchable, sortable table of all platform users with real-time approval status management.
 */
export default function UserTable({
  users,
  loading,
  canWrite,
  onViewUser,
  onEditRole,
  onEditPlan,
  onDisable,
  onEnable,
  onApprove,
  onReject,
  onReAllow,
  onRefresh
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'pending' | 'approved' | 'rejected'
  const [sortKey, setSortKey] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [enablingUid, setEnablingUid] = useState(null)
  const [approvingUid, setApprovingUid] = useState(null)
  const [reAllowingUid, setReAllowingUid] = useState(null)
  const [rejectingUser, setRejectingUser] = useState(null)

  // Status breakdown counts
  const counts = useMemo(() => {
    let pending = 0
    let approved = 0
    let rejected = 0
    users.forEach(u => {
      const status = u.approvalStatus || (u.role === 'admin' ? 'approved' : 'approved')
      if (status === 'pending') pending++
      else if (status === 'rejected') rejected++
      else approved++
    })
    return { all: users.length, pending, approved, rejected }
  }, [users])

  // Filter by status tab & search query
  const filtered = useMemo(() => {
    let list = users.filter(u => {
      const status = u.approvalStatus || (u.role === 'admin' ? 'approved' : 'approved')
      if (statusFilter === 'pending') return status === 'pending'
      if (statusFilter === 'approved') return status === 'approved'
      if (statusFilter === 'rejected') return status === 'rejected'
      return true
    })

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(u =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      )
    }

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
  }, [users, statusFilter, search, sortKey, sortDir])

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

  async function handleApprove(user) {
    if (!canWrite) {
      toast.error('Write entitlement required to approve access')
      return
    }
    setApprovingUid(user.uid)
    try {
      await apiClient(`/api/admin/users/${user.uid}/approve`, { method: 'PATCH' })
      toast.success(`Access approved for ${user.displayName || user.email}`)
      onApprove?.(user)
      onRefresh?.()
    } catch (e) {
      toast.error(e.message || 'Failed to approve account')
    } finally {
      setApprovingUid(null)
    }
  }

  async function handleReAllow(user) {
    if (!canWrite) {
      toast.error('Write entitlement required to re-allow access')
      return
    }
    setReAllowingUid(user.uid)
    try {
      await apiClient(`/api/admin/users/${user.uid}/re-allow`, { method: 'PATCH' })
      toast.success(`Account re-allowed and approved for ${user.displayName || user.email}`)
      onReAllow?.(user)
      onRefresh?.()
    } catch (e) {
      toast.error(e.message || 'Failed to re-allow account')
    } finally {
      setReAllowingUid(null)
    }
  }

  async function handleEnable(user) {
    setEnablingUid(user.uid)
    try {
      await apiClient(`/api/admin/users/${user.uid}/enable`, { method: 'PATCH' })
      toast.success('Account re-enabled')
      onEnable?.(user)
      onRefresh?.()
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
      ApprovalStatus: u.approvalStatus || (u.role === 'admin' ? 'approved' : 'approved'),
      ReadEntitlement: u.entitlements?.read ? 'Yes' : 'No',
      WriteEntitlement: u.entitlements?.write ? 'Yes' : 'No',
      Disabled: u.disabled ? 'Yes' : 'No',
      WatchlistCount: u.watchlistCount || 0,
      CreatedAt: u.createdAt || '',
      LastSignInAt: u.lastSignInAt || '',
    }))
    exportToCSV(exportData, `users_directory_${statusFilter}_${new Date().toISOString().split('T')[0]}.csv`)
    toast.success(`Exported ${exportData.length} users to CSV`)
  }

  return (
    <div className="space-y-4">
      {/* ── Approval Status Filter Pills ── */}
      <div className="flex items-center gap-2 flex-wrap border-b border-border/50 pb-3">
        {[
          { id: 'all', label: 'All Accounts', count: counts.all },
          { id: 'pending', label: 'Pending Review', count: counts.pending, alert: counts.pending > 0 },
          { id: 'approved', label: 'Approved Access', count: counts.approved },
          { id: 'rejected', label: 'Declined / Rejected', count: counts.rejected },
        ].map(tab => {
          const isActive = statusFilter === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition relative',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface hover:bg-surfaceHover text-textMuted hover:text-textPrimary border border-border/70'
              )}
            >
              <span>{tab.label}</span>
              <span className={clsx(
                'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
                isActive
                  ? 'bg-white/20 text-white'
                  : tab.alert
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-background text-textMuted'
              )}>
                {tab.count}
              </span>
              {tab.alert && !isActive && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-1 -right-1" />
              )}
            </button>
          )
        })}
      </div>

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
          <span>Export (CSV)</span>
        </button>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-[11px] font-semibold text-textMuted uppercase tracking-wider">
                <th className="text-left px-4 py-3">User</th>
                <th
                  className="text-left px-4 py-3 cursor-pointer hover:text-textPrimary transition"
                  onClick={() => toggleSort('role')}
                >
                  <div className="flex items-center gap-1">Role <SortIcon col="role" /></div>
                </th>
                <th
                  className="text-left px-4 py-3 cursor-pointer hover:text-textPrimary transition"
                  onClick={() => toggleSort('plan')}
                >
                  <div className="flex items-center gap-1">Plan <SortIcon col="plan" /></div>
                </th>
                <th
                  className="text-right px-4 py-3 cursor-pointer hover:text-textPrimary transition"
                  onClick={() => toggleSort('watchlistCount')}
                >
                  <div className="flex items-center justify-end gap-1">Watchlist <SortIcon col="watchlistCount" /></div>
                </th>
                <th className="text-left px-4 py-3">Access Status</th>
                <th className="text-left px-4 py-3">Account State</th>
                <th
                  className="text-left px-4 py-3 cursor-pointer hover:text-textPrimary transition"
                  onClick={() => toggleSort('lastSignInAt')}
                >
                  <div className="flex items-center gap-1">Last Sign-In <SortIcon col="lastSignInAt" /></div>
                </th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="px-4 py-4" colSpan={8}>
                      <div className="skeleton h-8 rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-textMuted text-sm">
                    {statusFilter === 'pending'
                      ? 'No pending access requests waiting for review 🎉'
                      : 'No users found matching current filters'}
                  </td>
                </tr>
              ) : (
                filtered.map((user, idx) => {
                  const status = user.approvalStatus || (user.role === 'admin' ? 'approved' : 'approved')
                  const isPending = status === 'pending' && user.role !== 'admin'
                  const isRejected = status === 'rejected' && user.role !== 'admin'
                  const isApproved = status === 'approved' || user.role === 'admin'

                  return (
                    <motion.tr
                      key={user.uid}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.025, duration: 0.2 }}
                      className={clsx(
                        'border-b border-border/30 transition-colors group',
                        isPending ? 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]' : 'hover:bg-surface/50'
                      )}
                    >
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            'w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm',
                            isPending
                              ? 'bg-gradient-to-tr from-amber-500 to-amber-600'
                              : isRejected
                                ? 'bg-gradient-to-tr from-rose-500 to-danger'
                                : 'bg-gradient-to-tr from-primary to-blue-400'
                          )}>
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
                            <span className="text-[9px] text-textMuted/60 font-mono">
                              {user.entitlements?.write ? 'R+W' : user.entitlements?.read ? 'R' : '—'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Membership Plan */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-0.5">
                          <span className={clsx(
                            'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
                            user.plan === 'premium'
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : user.plan === 'pro'
                              ? 'bg-primary/15 text-primary border-primary/30'
                              : 'bg-surface text-textMuted border-border'
                          )}>
                            <Crown className="w-2.5 h-2.5" />
                            {user.plan || 'basic'}
                          </span>
                          {user.planExpiresAt && (
                            <span className={clsx(
                              "text-[9px] font-mono",
                              user.planStatus === 'expired' ? "text-danger" : "text-textMuted/70"
                            )}>
                              {user.planStatus === 'expired' ? 'Expired' : `Exp ${new Date(user.planExpiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Watchlist count */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-textPrimary">{user.watchlistCount ?? 0}</span>
                      </td>

                      {/* Access / Approval Status */}
                      <td className="px-4 py-3">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            Pending Review
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30" title={user.rejectedReason || 'Declined'}>
                            <XCircle className="w-3 h-3" />
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Approved
                          </span>
                        )}
                      </td>

                      {/* Account State (Active / Disabled) */}
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
                        <div className="flex items-center justify-end gap-1.5">
                          {/* ── Primary Approval / Re-Allow Quick Actions ── */}
                          {canWrite && isPending && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleApprove(user)}
                                disabled={approvingUid === user.uid}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[11px] transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                                title="Approve and grant access"
                              >
                                {approvingUid === user.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => setRejectingUser(user)}
                                className="px-2 py-1 rounded-lg border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger font-semibold text-[11px] transition flex items-center gap-1"
                                title="Decline access request"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Reject</span>
                              </button>
                            </div>
                          )}

                          {canWrite && isRejected && (
                            <button
                              onClick={() => handleReAllow(user)}
                              disabled={reAllowingUid === user.uid}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/40 font-bold text-[11px] transition flex items-center gap-1 disabled:opacity-50"
                              title="Re-allow and approve this account"
                            >
                              {reAllowingUid === user.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                              <span>Re-Allow Access</span>
                            </button>
                          )}

                          {/* View details drawer */}
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
                                title="Edit role & permissions"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit membership plan */}
                              <button
                                onClick={() => onEditPlan?.(user)}
                                className="p-1.5 rounded-lg text-textMuted hover:text-primary hover:bg-primary/10 transition"
                                title="Manage membership plan tier & validity"
                              >
                                <Crown className="w-3.5 h-3.5" />
                              </button>

                              {/* Reject / Revoke if approved */}
                              {isApproved && user.role !== 'admin' && (
                                <button
                                  onClick={() => setRejectingUser(user)}
                                  className="p-1.5 rounded-lg text-textMuted hover:text-danger hover:bg-danger/10 transition"
                                  title="Revoke access"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                </button>
                              )}

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
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between">
            <p className="text-xs text-textMuted">
              Showing {filtered.length} of {users.length} accounts
              {statusFilter !== 'all' && ` (${statusFilter})`}
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

      {/* Reject User Modal */}
      {rejectingUser && (
        <RejectUserModal
          user={rejectingUser}
          onClose={() => setRejectingUser(null)}
          onSuccess={() => {
            onReject?.(rejectingUser)
            onRefresh?.()
          }}
        />
      )}
    </div>
  )
}
