import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  User,
  Bell,
  Download,
  Trash2,
  AlertTriangle,
  Send,
  CheckCircle,
  XCircle,
  Save,
  Filter,
  ChevronDown,
  ChevronRight,
  Search,
  Calendar,
  ShieldCheck,
  LogOut,
  Smartphone,
  Moon,
  RotateCcw,
} from 'lucide-react'
import { updateProfile, deleteUser } from 'firebase/auth'
import { useAuth } from '../../contexts/AuthContext'
import { useWatchlist } from '../../contexts/WatchlistContext'
import { exportToCSV } from '../../utils/csvParser'
import { getPrefs, savePrefs } from '../../services/alertService'
import ConfirmDialog from '../Common/ConfirmDialog'
import toast from 'react-hot-toast'
import { auth } from '../../services/firebase'
import { useWebPush } from '../../hooks/useWebPush'
import { apiClient } from '../../services/apiClient'
import { ALERT_CATEGORIES } from '../../utils/bseCategories'
import NotificationScopeSettings from './NotificationScopeSettings'
import { Spinner } from '../Common/Loader'

/* ------------------------------------------------------------------ */
/* Reusable UI Primitives                                             */
/* ------------------------------------------------------------------ */

function Section({
  id,
  title,
  icon: Icon,
  description,
  badge,
  children,
  className = '',
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 bg-surface border border-border rounded-2xl overflow-hidden ${className}`}
    >
      <div className="px-4 sm:px-6 py-4 border-b border-border/70 bg-surface/90">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-semibold text-textPrimary">{title}</h2>
                {badge}
              </div>
              {description && (
                <p className="text-xs sm:text-sm text-textMuted mt-1 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

function StatusBadge({ tone = 'neutral', children }) {
  const styles = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    primary: 'bg-primary/10 text-primary border-primary/20',
    neutral: 'bg-background text-textMuted border-border',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap ${styles[tone] || styles.neutral}`}>
      {children}
    </span>
  )
}

function SettingRow({ icon: Icon, title, description, right, className = '' }) {
  return (
    <div className={`flex items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-background/50 border border-border/70 ${className}`}>
      <div className="flex items-start gap-3 min-w-0 pr-2">
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
            <Icon className="w-4 h-4 text-textMuted" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-textPrimary leading-snug">{title}</p>
          {description && <p className="text-xs text-textMuted leading-relaxed mt-1">{description}</p>}
        </div>
      </div>
      <div className="flex-shrink-0 mt-0.5 sm:mt-0">{right}</div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-all duration-200 border ${
        checked
          ? 'bg-primary border-primary shadow-sm shadow-primary/30'
          : 'bg-border/80 border-border'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  error,
  placeholder,
  disabled,
}) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-textMuted mb-1.5">{label}</label>}
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full bg-background border rounded-xl px-4 py-3 text-textPrimary placeholder-textMuted/50 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/60 transition-colors text-sm disabled:opacity-50 ${error ? 'border-danger' : 'border-border'}`}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}

function SectionAnchor({ href, icon: Icon, label }) {
  return (
    <a
      href={`#${href}`}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border text-xs font-medium text-textMuted hover:text-textPrimary hover:border-primary/30 transition-colors whitespace-nowrap"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </a>
  )
}

function SaveButton({ saving, dirty, onClick, children, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={saving || !dirty}
      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
    >
      {saving ? <Spinner size="sm" className="scale-75" /> : <Save className="w-4 h-4" />}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Main SettingsPage Component                                        */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const { currentUser, logout } = useAuth()
  const { watchlist, clearWatchlist } = useWatchlist()
  const {
    isSupported,
    isSubscribed,
    loading: pushLoading,
    pushErrorDetails,
    subscribe,
    unsubscribe,
    sendTest,
    permission,
  } = useWebPush()

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [notifPrefs, setNotifPrefs] = useState({
    telegramEnabled: true,
    telegramChatId: '',
    inAppEnabled: true,
    frequency: 'realtime',
    blockedCategories: [],
    notifyWatchlist: true,
    notifyAllAnnouncements: false,
    notifyIpoAllotment: true,
    notifyIpoClosing: true,
  })
  const [savingPrefs, setSavingPrefs] = useState(false)

  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [prefsSnapshot, setPrefsSnapshot] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [expandedCats, setExpandedCats] = useState({})
  const [catSearch, setCatSearch] = useState('')
  const [telegramStatus, setTelegramStatus] = useState(null)
  const [telegramTesting, setTelegramTesting] = useState(false)

  const loadPrefs = useCallback(async () => {
    try {
      const p = await getPrefs(currentUser?.uid)
      if (p && Object.keys(p).length) {
        setNotifPrefs((prev) => ({ ...prev, ...p }))
      }
    } catch {
      // Keep defaults on failure.
    } finally {
      setPrefsLoaded(true)
    }
  }, [currentUser])

  useEffect(() => {
    loadPrefs()
  }, [loadPrefs])

  useEffect(() => {
    if (prefsLoaded) setPrefsSnapshot(JSON.stringify(notifPrefs))
  }, [prefsLoaded])

  useEffect(() => {
    if (!currentUser?.uid) return

    apiClient('/api/telegram-status')
      .then(setTelegramStatus)
      .catch(() => setTelegramStatus({ configured: false, hasBotToken: false, hasChatId: false }))
  }, [currentUser?.uid])

  useEffect(() => {
    if (!currentUser) return
    setDisplayName(currentUser.displayName || '')
  }, [currentUser])

  const notifPrefsDirty = prefsLoaded && JSON.stringify(notifPrefs) !== prefsSnapshot
  const profileDirty = displayName !== (currentUser?.displayName || '')

  const allCategoryNames = useMemo(
    () => Object.entries(ALERT_CATEGORIES).flatMap(([cat, subs]) => [cat, ...subs]),
    []
  )

  const blockedCount = (notifPrefs.blockedCategories || []).length
  const activeCount = Math.max(allCategoryNames.length - blockedCount, 0)

  const filteredCategories = useMemo(() => {
    const entries = Object.entries(ALERT_CATEGORIES)
    if (!catSearch.trim()) return entries
    const q = catSearch.trim().toLowerCase()
    return entries.filter(
      ([catName, subCats]) =>
        catName.toLowerCase().includes(q) || subCats.some((s) => s.toLowerCase().includes(q))
    )
  }, [catSearch])

  // Extract initial uppercase letter for profile avatar
  const profileInitial = (displayName || currentUser?.email || 'U').trim().charAt(0).toUpperCase()

  const memberSince = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  const announcementScope = notifPrefs.notifyAllAnnouncements
    ? 'All Market'
    : notifPrefs.notifyWatchlist
      ? 'Watchlist Only'
      : 'None'

  function toggleBlockedCategory(name) {
    setNotifPrefs((prev) => {
      const blocked = prev.blockedCategories || []
      const isBlocked = blocked.includes(name)
      return {
        ...prev,
        blockedCategories: isBlocked
          ? blocked.filter((c) => c !== name)
          : [...blocked, name],
      }
    })
  }

  function allowAllCategories() {
    setNotifPrefs((prev) => ({ ...prev, blockedCategories: [] }))
  }

  function blockAllCategories() {
    setNotifPrefs((prev) => ({ ...prev, blockedCategories: allCategoryNames }))
  }

  function expandAllCategories() {
    setExpandedCats(Object.fromEntries(Object.keys(ALERT_CATEGORIES).map((k) => [k, true])))
  }

  function collapseAllCategories() {
    setExpandedCats({})
  }

  function resetNotificationDefaults() {
    setNotifPrefs((prev) => ({
      ...prev,
      telegramEnabled: true,
      inAppEnabled: true,
      frequency: 'realtime',
      notifyWatchlist: true,
      notifyAllAnnouncements: false,
      notifyIpoAllotment: true,
      blockedCategories: [],
    }))
  }

  async function handleSaveProfile(e) {
    e?.preventDefault()
    if (!displayName.trim()) return

    setSavingProfile(true)
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() })
      toast.success('Profile updated')
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSavePrefs(successMessage = 'Notification preferences saved') {
    setSavingPrefs(true)
    try {
      await savePrefs(currentUser?.uid, notifPrefs)
      setPrefsSnapshot(JSON.stringify(notifPrefs))
      toast.success(successMessage)
    } catch {
      toast.error('Failed to save preferences')
    } finally {
      setSavingPrefs(false)
    }
  }

  async function handleTelegramTest() {
    setTelegramTesting(true)
    try {
      const data = await apiClient('/api/telegram-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: notifPrefs.telegramChatId }),
      })

      if (data.sent) toast.success('Test message sent! Check your Telegram.')
      else toast.error(data.message || data.error || 'Failed to send test message')
    } catch {
      toast.error('Could not reach backend')
    } finally {
      setTelegramTesting(false)
    }
  }

  async function handleSaveTelegram() {
    setSavingPrefs(true)
    try {
      await savePrefs(currentUser?.uid, notifPrefs)
      setPrefsSnapshot(JSON.stringify(notifPrefs))
      toast.success('Telegram settings saved')
      const status = await apiClient('/api/telegram-status')
      setTelegramStatus(status)
    } catch {
      toast.error('Failed to save Telegram settings')
    } finally {
      setSavingPrefs(false)
    }
  }

  function handleExportWatchlist() {
    if (!watchlist.length) {
      toast.error('Watchlist is empty')
      return
    }

    exportToCSV(
      watchlist.map(({ scriptName, ltdCode, exchange, notes }) => ({
        'Script Name': scriptName,
        'LTD Code': ltdCode,
        Exchange: exchange,
        Notes: notes || '',
      })),
      'watchlist.csv'
    )
    toast.success('Watchlist exported')
  }

  async function handleClearWatchlist() {
    try {
      await clearWatchlist()
      toast.success('Watchlist cleared')
    } catch {
      toast.error('Failed to clear watchlist')
    } finally {
      setClearConfirm(false)
    }
  }

  async function handleDeleteAccount() {
    try {
      await deleteUser(auth.currentUser)
      toast.success('Account deleted')
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        toast.error('Please sign in again before deleting your account')
      } else {
        toast.error(err.message || 'Failed to delete account')
      }
    } finally {
      setDeleteConfirm(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Account Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-textPrimary tracking-tight">Settings</h1>
            <p className="text-sm sm:text-base text-textMuted mt-1 max-w-2xl">
              Manage your profile, notifications, integrations and StockWatch preferences from one page.
            </p>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
            <input
              placeholder="Search settings..."
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const query = e.currentTarget.value.trim().toLowerCase()
                if (!query) return
                const target = ['profile', 'notifications', 'categories', 'telegram', 'watchlist', 'account']
                  .find((id) => id.includes(query))
                if (target) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
            />
          </div>
        </div>

        {/* Quick status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="bg-surface border border-border rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-textMuted">Account</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">{currentUser?.emailVerified ? 'Verified' : 'Unverified'}</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="w-4 h-4 text-primary" />
              <span className="text-xs text-textMuted">Push</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">{isSubscribed ? 'Active' : 'Inactive'}</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-sky-400" />
              <span className="text-xs text-textMuted">Telegram</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">
              {telegramStatus?.configured ? 'Connected' : 'Not connected'}
            </p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-primary" />
              <span className="text-xs text-textMuted">Watchlist</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">{watchlist.length} scripts</p>
          </div>
        </div>
      </div>

      {/* Page-level quick jump */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-2.5 mb-6 bg-background/90 backdrop-blur-xl border-y border-border/60">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <SectionAnchor href="profile" icon={User} label="Profile" />
          <SectionAnchor href="notifications" icon={Bell} label="Notifications" />
          <SectionAnchor href="categories" icon={Filter} label="Categories" />
          <SectionAnchor href="telegram" icon={Send} label="Telegram" />
          <SectionAnchor href="watchlist" icon={Download} label="Watchlist" />
          <SectionAnchor href="account" icon={AlertTriangle} label="Account" />
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-6">
        {/* Profile */}
        <Section
          id="profile"
          title="Profile"
          icon={User}
          description="Manage your account information and identity."
          badge={currentUser?.emailVerified ? <StatusBadge tone="success"><CheckCircle className="w-3 h-3" /> Verified</StatusBadge> : <StatusBadge tone="warning">Email not verified</StatusBadge>}
        >
          <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
            <div className="rounded-2xl border border-border bg-background/50 p-5 flex flex-col items-center justify-center text-center min-h-[220px]">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-[#38E1C6] flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-primary/20 overflow-hidden select-none">
                {profileInitial}
              </div>
              <p className="text-base font-semibold text-textPrimary mt-3 truncate max-w-full">{displayName || currentUser?.email}</p>
              <p className="text-xs text-textMuted mt-1 truncate max-w-full">{currentUser?.email}</p>
              {memberSince && (
                <p className="text-xs text-textMuted flex items-center gap-1 mt-3">
                  <Calendar className="w-3 h-3" /> Member since {memberSince}
                </p>
              )}
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <InputField
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
              <InputField
                label="Email"
                value={currentUser?.email || ''}
                disabled
              />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <p className="text-xs text-textMuted">Your email is managed by Firebase Authentication.</p>
                <SaveButton saving={savingProfile} dirty={profileDirty} onClick={handleSaveProfile}>
                  Save Profile
                </SaveButton>
              </div>
            </form>
          </div>
        </Section>

        {/* Notifications */}
        <Section
          id="notifications"
          title="Notification Center"
          icon={Bell}
          description="Choose what StockWatch should send, where it should send it, and how often."
          badge={notifPrefsDirty ? <StatusBadge tone="warning">Unsaved changes</StatusBadge> : <StatusBadge tone="success">Saved</StatusBadge>}
        >
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 xl:grid-cols-2 gap-4">
              <SettingRow
                icon={Send}
                title="Telegram Notifications"
                description="Send configured alerts to Telegram."
                right={<Toggle checked={!!notifPrefs.telegramEnabled} onChange={() => setNotifPrefs((p) => ({ ...p, telegramEnabled: !p.telegramEnabled }))} label="Toggle Telegram notifications" />}
              />
              <SettingRow
                icon={Bell}
                title="In-App Notifications"
                description="Show notification feedback inside StockWatch."
                right={<Toggle checked={!!notifPrefs.inAppEnabled} onChange={() => setNotifPrefs((p) => ({ ...p, inAppEnabled: !p.inAppEnabled }))} label="Toggle in-app notifications" />}
              />
              <SettingRow
                icon={ShieldCheck}
                title="IPO Allotment Alerts"
                description="Notify when a newly detected IPO becomes available for verification."
                right={<Toggle checked={!!notifPrefs.notifyIpoAllotment} onChange={() => setNotifPrefs((p) => ({ ...p, notifyIpoAllotment: !p.notifyIpoAllotment }))} label="Toggle IPO allotment alerts" />}
              />
              <SettingRow
                icon={Calendar}
                title="IPO Closing Reminders (Last Day)"
                description="Web Push notification at 11:00 AM IST on the exact last day an IPO is open for application. Includes latest GMP."
                right={<Toggle checked={notifPrefs.notifyIpoClosing !== false} onChange={() => setNotifPrefs((p) => ({ ...p, notifyIpoClosing: p.notifyIpoClosing === false ? true : false }))} label="Toggle IPO closing reminders" />}
                className="border-amber-500/30 bg-amber-500/5"
              />
            </div>

            <div className="rounded-2xl border border-border bg-background/40 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm font-semibold text-textPrimary">Announcement notification scope</p>
                  <p className="text-xs text-textMuted mt-1">Category and subcategory filters still apply.</p>
                </div>
                <StatusBadge tone="primary">Current: {announcementScope}</StatusBadge>
              </div>
              <NotificationScopeSettings
                prefs={notifPrefs}
                onPrefsChange={(updated) => setNotifPrefs(updated)}
              />
            </div>

            {isSupported && (
              <div className="rounded-2xl border border-border bg-background/40 p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <Smartphone className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-textPrimary">Browser Push Notifications</p>
                      <p className="text-xs text-textMuted mt-1">Receive OS-level notifications even when StockWatch is in the background.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSubscribed ? (
                      <button
                        onClick={unsubscribe}
                        disabled={pushLoading}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded-lg transition"
                      >
                        {pushLoading ? 'Disabling…' : 'Disable'}
                      </button>
                    ) : (
                      <button
                        onClick={subscribe}
                        disabled={pushLoading || permission === 'denied'}
                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg transition"
                      >
                        {pushLoading ? 'Enabling…' : permission === 'granted' ? 'Sync Subscription' : 'Enable'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge tone={permission === 'granted' && isSubscribed ? 'success' : permission === 'denied' ? 'danger' : 'warning'}>
                    {permission === 'granted' ? 'Permission granted' : permission === 'denied' ? 'Permission blocked' : `Permission ${permission}`}
                  </StatusBadge>
                  {isSubscribed && <StatusBadge tone="success">Active on this device</StatusBadge>}
                </div>

                {permission === 'denied' && (
                  <div className="p-4 bg-danger/5 border border-danger/20 rounded-xl">
                    <p className="text-sm text-danger font-semibold mb-1">Notifications are blocked</p>
                    <p className="text-xs text-textMuted leading-relaxed">
                      Open your browser site permissions (click the lock icon in the address bar), set Notifications to <strong>Allow</strong>, reload StockWatch, and click Enable.
                    </p>
                  </div>
                )}

                {pushErrorDetails === 'BRAVE_CONFIG_REQUIRED' && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
                    <p className="text-sm text-amber-500 font-semibold flex items-center gap-1.5">
                      🦁 Brave Browser Push Setup Required
                    </p>
                    <p className="text-xs text-textMuted leading-relaxed">
                      Brave blocks push notification services by default. To receive announcements:
                    </p>
                    <ol className="text-xs text-textMuted list-decimal list-inside space-y-1 font-mono">
                      <li>Open <code className="bg-surface px-1.5 py-0.5 rounded border border-border">brave://settings/privacy</code></li>
                      <li>Turn ON <strong>"Use Google services for push messaging"</strong></li>
                      <li>Relaunch Brave and click <strong>Sync Subscription</strong> above</li>
                    </ol>
                  </div>
                )}

                {pushErrorDetails === 'PUSH_SERVICE_ERROR' && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
                    <p className="text-sm text-amber-500 font-semibold flex items-center gap-1.5">
                      ⚠️ Browser Push Service Connection Issue
                    </p>
                    <p className="text-xs text-textMuted leading-relaxed">
                      The browser push service could not be reached. If you are in <strong>Incognito / Private Browsing</strong> mode, please switch to a normal window. Also check that your VPN, AdBlocker, or firewall allows Google/Mozilla push services.
                    </p>
                  </div>
                )}

                {isSubscribed && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={sendTest}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      Send Test Notification
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-border bg-background/40 p-4 sm:p-5">
              <div className="flex items-start gap-3 mb-4">
                <Moon className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-textPrimary">Delivery frequency</p>
                  <p className="text-xs text-textMuted mt-1">Choose how frequently eligible alerts should be delivered.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  ['realtime', 'Real-time', 'Fire immediately'],
                  ['hourly', 'Hourly', 'Digest summary'],
                  ['daily', 'Daily', 'Daily summary'],
                ].map(([value, label, desc]) => {
                  const selected = notifPrefs.frequency === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setNotifPrefs((p) => ({ ...p, frequency: value }))}
                      className={`text-left p-4 rounded-xl border transition-colors ${
                        selected
                          ? 'border-primary/50 bg-primary/8'
                          : 'border-border bg-background hover:border-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-semibold ${selected ? 'text-primary' : 'text-textPrimary'}`}>{label}</span>
                        {selected && <CheckCircle className="w-4 h-4 text-primary" />}
                      </div>
                      <p className="text-xs text-textMuted mt-1">{desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
              <p className="text-xs text-textMuted">
                Notification controls are saved together so the backend remains the source of truth.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetNotificationDefaults}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-border text-textMuted hover:text-textPrimary hover:border-primary/30 text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset Defaults
                </button>
                <SaveButton saving={savingPrefs} dirty={notifPrefsDirty} onClick={() => handleSavePrefs()}>
                  Save Preferences
                </SaveButton>
              </div>
            </div>
          </div>
        </Section>

        {/* Categories */}
        <Section
          id="categories"
          title="Alert Categories"
          icon={Filter}
          description="Fine-tune which BSE/NSE announcement types can trigger notifications."
          badge={<StatusBadge tone="primary">{activeCount} active · {blockedCount} blocked</StatusBadge>}
        >
          <div className="space-y-4">
            <div className="rounded-xl p-4 bg-primary/5 border border-primary/20">
              <div className="flex items-start gap-3">
                <Filter className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-primary">Customize your notifications</p>
                  <p className="text-xs text-textMuted mt-1 leading-relaxed">
                    Enabled categories can notify you. Blocked categories are excluded by the backend notification filter. Parent category blocks can affect all of its subcategories.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
                <input
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="Search categories or subcategories…"
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={expandAllCategories} className="px-3 py-2 text-xs font-medium text-textMuted hover:text-textPrimary border border-border rounded-lg transition-colors">Expand All</button>
                <button type="button" onClick={collapseAllCategories} className="px-3 py-2 text-xs font-medium text-textMuted hover:text-textPrimary border border-border rounded-lg transition-colors">Collapse All</button>
                <button type="button" onClick={allowAllCategories} className="px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-400/10 border border-emerald-400/30 rounded-lg transition-colors">Allow All</button>
                <button type="button" onClick={blockAllCategories} className="px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-400/10 border border-red-400/30 rounded-lg transition-colors">Block All</button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {filteredCategories.map(([catName, subCats]) => {
                const isCatBlocked = (notifPrefs.blockedCategories || []).includes(catName)
                const isExpanded = expandedCats[catName]

                return (
                  <div key={catName} className="rounded-2xl border border-border overflow-hidden bg-background/40">
                    <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => setExpandedCats((p) => ({ ...p, [catName]: !p[catName] }))}
                          className="p-1.5 hover:bg-white/5 rounded-lg text-textMuted hover:text-textPrimary transition-colors disabled:opacity-30"
                          disabled={subCats.length === 0}
                          aria-label={`Toggle ${catName}`}
                        >
                          {subCats.length > 0 ? (
                            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                          ) : (
                            <div className="w-4 h-4" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold truncate ${isCatBlocked ? 'text-textMuted' : 'text-textPrimary'}`}>{catName}</p>
                          <p className="text-[11px] text-textMuted mt-0.5">{subCats.length} subcategor{subCats.length === 1 ? 'y' : 'ies'}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleBlockedCategory(catName)}
                        className={`w-11 h-6 rounded-full relative shrink-0 ${!isCatBlocked ? 'bg-emerald-500' : 'bg-border'} transition-colors`}
                        aria-label={`${isCatBlocked ? 'Enable' : 'Disable'} ${catName}`}
                      >
                        <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${!isCatBlocked ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {isExpanded && subCats.length > 0 && (
                      <div className="px-4 pb-4 pt-2 border-t border-border/60 bg-surface/40 space-y-1.5">
                        {subCats.map((subCat) => {
                          const isExplicitlySubBlocked = (notifPrefs.blockedCategories || []).includes(subCat)
                          const isEffectivelyBlocked = isCatBlocked || isExplicitlySubBlocked

                          return (
                            <label
                              key={subCat}
                              className={`flex items-center justify-between gap-3 p-2.5 rounded-lg transition-colors ${isCatBlocked ? 'opacity-60' : 'hover:bg-white/5'} cursor-pointer select-none`}
                            >
                              <span className={`text-xs leading-relaxed ${!isEffectivelyBlocked ? 'text-textPrimary' : 'text-textMuted'}`}>
                                {subCat}
                                {isCatBlocked && !isExplicitlySubBlocked && (
                                  <span className="block text-[10px] text-textMuted/70 mt-0.5">Blocked by parent category</span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleBlockedCategory(subCat)}
                                disabled={isCatBlocked}
                                className={`w-9 h-5 rounded-full relative shrink-0 ${!isExplicitlySubBlocked ? 'bg-emerald-500/80' : 'bg-border'} transition-colors disabled:cursor-not-allowed`}
                                aria-label={`${isExplicitlySubBlocked ? 'Enable' : 'Disable'} ${subCat}`}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${!isExplicitlySubBlocked ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {filteredCategories.length === 0 && (
              <div className="text-center py-10 rounded-2xl border border-dashed border-border bg-background/30">
                <Search className="w-5 h-5 mx-auto text-textMuted" />
                <p className="text-sm font-medium text-textPrimary mt-2">No categories found</p>
                <p className="text-xs text-textMuted mt-1">Try another category or subcategory name.</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <SaveButton saving={savingPrefs} dirty={notifPrefsDirty} onClick={() => handleSavePrefs('Categories saved')}>
                Save Alert Categories
              </SaveButton>
            </div>
          </div>
        </Section>

        {/* Telegram */}
        <Section
          id="telegram"
          title="Telegram Notifications"
          icon={Send}
          description="Connect Telegram to receive StockWatch alerts in your chat or group."
          badge={
            telegramStatus === null ? <StatusBadge tone="warning">Checking…</StatusBadge> :
            telegramStatus.configured ? <StatusBadge tone="success"><CheckCircle className="w-3 h-3" /> Connected</StatusBadge> :
            <StatusBadge tone="neutral">Not configured</StatusBadge>
          }
        >
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-background/40 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  {telegramStatus?.configured ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-textMuted/50 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-textPrimary">
                      {telegramStatus === null ? 'Checking Telegram connection…' : telegramStatus.configured ? 'Telegram is connected' : 'Telegram is not configured'}
                    </p>
                    <p className="text-xs text-textMuted mt-1 leading-relaxed">
                      {telegramStatus?.configured
                        ? 'Eligible StockWatch notifications can be delivered to your configured Telegram destination.'
                        : !telegramStatus?.hasBotToken
                          ? 'Telegram server integration is not configured yet.'
                          : 'Add your Chat ID below to connect your destination.'}
                    </p>
                  </div>
                </div>

                {telegramStatus?.configured && (
                  <button
                    type="button"
                    onClick={handleTelegramTest}
                    disabled={telegramTesting}
                    className="mt-4 inline-flex items-center gap-2 px-3.5 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60"
                  >
                    {telegramTesting ? <Spinner size="sm" className="scale-75" /> : <Send className="w-3.5 h-3.5" />}
                    Send Test Message
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-textPrimary mb-1.5">Your Telegram Chat ID</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={notifPrefs.telegramChatId || ''}
                    onChange={(e) => setNotifPrefs((p) => ({ ...p, telegramChatId: e.target.value }))}
                    placeholder="e.g. 123456789"
                    className="bg-background border border-border rounded-xl px-4 py-3 text-textPrimary placeholder-textMuted/50 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/60 transition-colors text-sm flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTelegram}
                    disabled={savingPrefs}
                    className="px-4 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                  >
                    {savingPrefs ? <Spinner size="sm" className="scale-75" /> : <Save className="w-4 h-4" />}
                    Save Chat ID
                  </button>
                </div>
                <p className="text-xs text-textMuted mt-1.5">
                  Send <code className="px-1.5 py-0.5 bg-surface border border-border rounded text-[11px] font-mono">/start</code> to your bot in Telegram to retrieve your Chat ID.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-5 space-y-3">
              <p className="text-sm font-semibold text-textPrimary">Quick Setup Instructions</p>
              <ol className="list-decimal list-inside space-y-2 text-xs text-textMuted leading-relaxed">
                <li>Search for your StockWatch Telegram Bot.</li>
                <li>Tap <strong className="text-textPrimary">Start</strong> or send <code className="px-1.5 py-0.5 bg-surface border border-border rounded text-[11px] font-mono">/start</code>.</li>
                <li>Copy the Chat ID provided by the bot.</li>
                <li>Paste your Chat ID into the field on the left and click <strong className="text-textPrimary">Save Chat ID</strong>.</li>
                <li>Click <strong className="text-textPrimary">Send Test Message</strong> to verify delivery.</li>
              </ol>
            </div>
          </div>
        </Section>

        {/* Watchlist */}
        <Section
          id="watchlist"
          title="Watchlist Management"
          icon={Download}
          description="Export or reset your saved script watchlist."
          badge={<StatusBadge tone="neutral">{watchlist.length} tracked scripts</StatusBadge>}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-textPrimary">Data & Storage</p>
              <p className="text-xs text-textMuted leading-relaxed max-w-xl">
                Export your tracked company list as a standard CSV file or clear your stored watchlist data.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleExportWatchlist}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-surface hover:bg-white/5 border border-border text-textPrimary rounded-xl text-sm font-semibold transition-colors"
              >
                <Download className="w-4 h-4 text-primary" />
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => setClearConfirm(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-danger/10 hover:bg-danger/20 border border-danger/20 text-danger rounded-xl text-sm font-semibold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear Watchlist
              </button>
            </div>
          </div>
        </Section>

        {/* Account Danger Zone */}
        <Section
          id="account"
          title="Account Danger Zone"
          icon={AlertTriangle}
          description="Sensitive actions regarding your StockWatch access and session."
          className="border-danger/30"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-textPrimary">Account Termination & Session</p>
              <p className="text-xs text-textMuted leading-relaxed max-w-xl">
                Sign out of your active session or permanently delete your account and personal settings from StockWatch.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={logout}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-surface hover:bg-white/5 border border-border text-textPrimary rounded-xl text-sm font-semibold transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>

              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-danger hover:bg-danger/90 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Account
              </button>
            </div>
          </div>
        </Section>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={clearConfirm}
        onClose={() => setClearConfirm(false)}
        onConfirm={handleClearWatchlist}
        title="Clear Watchlist"
        message="Are you sure you want to clear your entire watchlist? This action cannot be undone."
        confirmText="Clear Watchlist"
        danger
      />

      <ConfirmDialog
        isOpen={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message="Are you sure you want to permanently delete your StockWatch account? All your preferences and data will be erased."
        confirmText="Delete Account"
        danger
      />
    </div>
  )
}
