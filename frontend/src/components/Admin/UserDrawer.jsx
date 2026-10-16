import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Star, Bell, Smartphone, Tag, Loader2, Trash2, RefreshCw
} from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import { useAdminAuth } from '../../hooks/useAdminAuth'
import clsx from 'clsx'
import toast from 'react-hot-toast'

/** Watchlist sub-panel */
function WatchlistSubPanel({ uid, canWrite, onDelete }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    apiClient(`/api/admin/users/${uid}/watchlist`)
      .then(d => { if (mounted) setItems(d.watchlist || []) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [uid])

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
  if (!items.length) return <p className="text-sm text-textMuted text-center py-6">No watchlist entries</p>

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-hide">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border group">
          <Star className="w-3.5 h-3.5 text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-textPrimary truncate">{item.scriptName || 'Unknown'}</p>
            <p className="text-xs text-textMuted">{item.ltdCode || item.bseCode || item.nseSymbol || '—'} · {item.exchange || '—'}</p>
          </div>
          {canWrite && (
            <button
              onClick={() => {
                if (window.confirm(`Remove "${item.scriptName}" from this user's watchlist?`)) {
                  apiClient(`/api/admin/users/${uid}/watchlist/${item.id}`, { method: 'DELETE' })
                    .then(() => {
                      setItems(prev => prev.filter(i => i.id !== item.id))
                      toast.success('Watchlist entry removed')
                      onDelete?.()
                    })
                    .catch(e => toast.error(e.message || 'Failed to delete'))
                }
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-textMuted hover:text-danger hover:bg-danger/10 transition-all"
              title="Remove entry"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Push devices sub-panel */
function DevicesSubPanel({ uid, canWrite }) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    apiClient(`/api/admin/users/${uid}/devices`)
      .then(d => { if (mounted) setDevices(d.devices || []) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [uid])

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
  if (!devices.length) return <p className="text-sm text-textMuted text-center py-6">No registered push devices</p>

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
      {devices.map(d => (
        <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border group">
          <Smartphone className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-textPrimary truncate">{d.deviceId || d.id}</p>
            <p className="text-xs text-textMuted">{d.platform || 'Web'} · Added {d.createdAt ? new Date(d.createdAt?.seconds ? d.createdAt.seconds * 1000 : d.createdAt).toLocaleDateString() : '—'}</p>
          </div>
          {canWrite && (
            <button
              onClick={() => {
                if (window.confirm('Remove this push device?')) {
                  apiClient(`/api/admin/users/${uid}/devices/${d.id}`, { method: 'DELETE' })
                    .then(() => {
                      setDevices(prev => prev.filter(x => x.id !== d.id))
                      toast.success('Device removed')
                    })
                    .catch(e => toast.error(e.message || 'Failed to delete'))
                }
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-textMuted hover:text-danger hover:bg-danger/10 transition-all"
              title="Remove device"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Recent alerts sub-panel */
function AlertsSubPanel({ uid }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    apiClient(`/api/admin/users/${uid}/alerts?limit=20`)
      .then(d => { if (mounted) setAlerts(d.alerts || []) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [uid])

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
  if (!alerts.length) return <p className="text-sm text-textMuted text-center py-6">No recent alerts</p>

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
      {alerts.map(a => (
        <div key={a.id} className="px-3 py-2.5 rounded-xl bg-surface border border-border">
          <p className="text-xs font-semibold text-textPrimary truncate">{a.scriptName || a.companyName || '—'}</p>
          <p className="text-xs text-textMuted mt-0.5 line-clamp-1">{a.subject || a.category || '—'}</p>
          <p className="text-[10px] text-textMuted/70 mt-1">{a.timestamp?.seconds ? new Date(a.timestamp.seconds * 1000).toLocaleString() : '—'}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * UserDrawer
 *
 * Slide-in right panel with complete user profile drill-down:
 * - Profile header with status badge
 * - Watchlist, Devices, and Alerts tabs
 *
 * Props:
 *   user     — enriched user object
 *   onClose  — callback to close
 *   onUpdate — callback when data changes (refresh parent)
 */
export default function UserDrawer({ user, onClose, onUpdate }) {
  const { canWrite } = useAdminAuth()
  const [activeTab, setActiveTab] = useState('watchlist')

  if (!user) return null

  const tabs = [
    { id: 'watchlist', label: 'Watchlist', icon: Star, count: user.watchlistCount },
    { id: 'devices', label: 'Devices', icon: Smartphone },
    { id: 'alerts', label: 'Recent Alerts', icon: Bell },
  ]

  const scopeLabel = user.prefs?.notificationScope || 'WATCHLIST_ONLY'
  const blockedCount = (user.prefs?.blockedCategories || []).length

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-40 flex justify-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Drawer */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className="relative w-full max-w-md h-full glass-panel rounded-none sm:rounded-l-3xl overflow-y-auto scrollbar-hide flex flex-col z-50"
        >
          {/* Header */}
          <div className="p-6 border-b border-border/50 flex-shrink-0">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-lg">
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-textPrimary font-display truncate">{user.displayName || 'No Name'}</p>
                <p className="text-sm text-textMuted truncate">{user.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {/* Role badge */}
                  <span className={clsx(
                    'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
                    user.role === 'admin'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-surface text-textMuted border-border'
                  )}>
                    {user.role || 'user'}
                  </span>
                  {/* Account status */}
                  <span className={clsx(
                    'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
                    user.disabled
                      ? 'bg-danger/15 text-danger border-danger/30'
                      : 'bg-success/15 text-success border-success/30'
                  )}>
                    {user.disabled ? 'Disabled' : 'Active'}
                  </span>
                  {/* Notification scope */}
                  <span className="text-[10px] text-textMuted border border-border rounded-full px-2 py-0.5">
                    {scopeLabel.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-white/5 transition flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'Watchlist', value: user.watchlistCount ?? 0 },
                { label: 'Blocked Cats', value: blockedCount },
                { label: 'Joined', value: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-textPrimary">{value}</p>
                  <p className="text-[10px] text-textMuted mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Disabled reason */}
            {user.disabled && user.disabledReason && (
              <div className="mt-3 px-3 py-2 rounded-xl bg-danger/10 border border-danger/20">
                <p className="text-xs text-danger"><span className="font-semibold">Reason:</span> {user.disabledReason}</p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-border/50 flex-shrink-0">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all',
                  activeTab === id
                    ? 'bg-primary/15 text-primary'
                    : 'text-textMuted hover:text-textPrimary hover:bg-white/5'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {count !== undefined && (
                  <span className={clsx(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    activeTab === id ? 'bg-primary/20 text-primary' : 'bg-surface text-textMuted border border-border'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">
            {activeTab === 'watchlist' && (
              <WatchlistSubPanel uid={user.uid} canWrite={canWrite} onDelete={() => onUpdate?.({ ...user, watchlistCount: Math.max(0, (user.watchlistCount || 0) - 1) })} />
            )}
            {activeTab === 'devices' && <DevicesSubPanel uid={user.uid} canWrite={canWrite} />}
            {activeTab === 'alerts' && <AlertsSubPanel uid={user.uid} />}
          </div>

          {/* Footer: Prefs quick view */}
          {user.prefs && (
            <div className="p-4 border-t border-border/50 flex-shrink-0">
              <p className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Notification Preferences</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'telegramEnabled', label: 'Telegram' },
                  { key: 'notifyWatchlist', label: 'Watchlist Notifs' },
                  { key: 'notifyAllAnnouncements', label: 'All Announcements' },
                  { key: 'notifyIpoAllotment', label: 'IPO Allotment' },
                  { key: 'notifyIpoClosing', label: 'IPO Closing' },
                ].map(({ key, label }) => (
                  <span
                    key={key}
                    className={clsx(
                      'text-[10px] px-2 py-1 rounded-full border font-semibold',
                      user.prefs[key] !== false
                        ? 'bg-success/10 text-success border-success/20'
                        : 'bg-surface text-textMuted border-border'
                    )}
                  >
                    {user.prefs[key] !== false ? '✓' : '✗'} {label}
                  </span>
                ))}
              </div>
              {blockedCount > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-warning" />
                  <p className="text-xs text-textMuted">{blockedCount} blocked categor{blockedCount > 1 ? 'ies' : 'y'}</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
