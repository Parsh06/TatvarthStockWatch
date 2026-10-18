import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
  Sun,
  RotateCcw,
  Crown,
  Zap,
  Share2,
  Eye,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Laptop,
  Plus,
  RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
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
import ShareBasketModal from '../Watchlist/ShareBasketModal'
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
      className={`scroll-mt-24 bg-surface border border-border rounded-2xl overflow-hidden shadow-sm ${className}`}
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
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border text-xs font-medium text-textMuted hover:text-textPrimary hover:border-primary/30 transition-colors whitespace-nowrap shadow-sm"
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
      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-primary/20"
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
  const navigate = useNavigate()
  const {
    currentUser,
    logout,
    plan,
    planStatus,
    planExpiresAt,
    dailyAiCount,
    planLimits,
    isAdmin,
    isPro,
    isPremium,
  } = useAuth()
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

  // Curated Baskets state
  const [myBaskets, setMyBaskets] = useState([])
  const [basketsLoading, setBasketsLoading] = useState(false)
  const [shareBasketOpen, setShareBasketOpen] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState(null)
  const [deleteBasketSlug, setDeleteBasketSlug] = useState(null)

  // Theme state
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'
  })

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

  const loadMyBaskets = useCallback(async () => {
    if (!currentUser?.uid) return
    setBasketsLoading(true)
    try {
      const res = await apiClient.get('/api/baskets/user/my')
      if (res?.success) {
        setMyBaskets(res.baskets || [])
      }
    } catch (err) {
      console.warn('[Settings] Failed to load my baskets:', err.message)
    } finally {
      setBasketsLoading(false)
    }
  }, [currentUser?.uid])

  useEffect(() => {
    loadPrefs()
    loadMyBaskets()
  }, [loadPrefs, loadMyBaskets])

  useEffect(() => {
    if (prefsLoaded) setPrefsSnapshot(JSON.stringify(notifPrefs))
  }, [prefsLoaded])

  useEffect(() => {
    if (!currentUser?.uid) return

    apiClient.get('/api/telegram-status')
      .then(setTelegramStatus)
      .catch(() => setTelegramStatus({ configured: false, hasBotToken: false, hasChatId: false }))
  }, [currentUser?.uid])

  useEffect(() => {
    if (!currentUser) return
    setDisplayName(currentUser.displayName || '')
  }, [currentUser])

  function handleThemeChange(newTheme) {
    setCurrentTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    const root = document.documentElement
    if (newTheme === 'dark') {
      root.classList.add('dark')
    } else if (newTheme === 'light') {
      root.classList.remove('dark')
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
    toast.success(`Theme switched to ${newTheme.toUpperCase()}`)
  }

  async function handleDeleteBasket(slug) {
    try {
      const res = await apiClient.delete(`/api/baskets/${encodeURIComponent(slug)}`)
      if (res?.success) {
        setMyBaskets(prev => prev.filter(b => b.slug !== slug && b.id !== slug))
        toast.success('Curated basket deleted successfully')
      } else {
        toast.error(res?.error || 'Failed to delete basket')
      }
    } catch (err) {
      toast.error(err.message || 'Error deleting basket')
    } finally {
      setDeleteBasketSlug(null)
    }
  }

  function copyBasketLink(slug) {
    const url = `${window.location.origin}/basket/${slug}`
    navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    toast.success('Public basket link copied!')
    setTimeout(() => setCopiedSlug(null), 2500)
  }

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
      const data = await apiClient.post('/api/telegram-test', {
        telegramChatId: notifPrefs.telegramChatId,
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
      const status = await apiClient.get('/api/telegram-status')
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

  // Quota percentages
  const maxWatch = planLimits?.maxWatchlist || 5
  const watchPct = maxWatch === Infinity ? 0 : Math.min(100, Math.round((watchlist.length / maxWatch) * 100))
  const maxAi = planLimits?.maxDailyAi || 3
  const aiPct = maxAi === Infinity ? 0 : Math.min(100, Math.round((dailyAiCount / maxAi) * 100))
  const maxBaskets = planLimits?.maxBaskets || 3
  const basketPct = maxBaskets === Infinity ? 0 : Math.min(100, Math.round((myBaskets.length / maxBaskets) * 100))

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Account Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-textPrimary tracking-tight">Settings & Preferences</h1>
            <p className="text-sm sm:text-base text-textMuted mt-1 max-w-2xl">
              Configure profile, membership quotas, notifications, public baskets, and market appearance.
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
                const target = ['profile', 'membership', 'baskets', 'notifications', 'categories', 'telegram', 'watchlist', 'appearance', 'account']
                  .find((id) => id.includes(query))
                if (target) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-xl text-sm text-textPrimary placeholder-textMuted/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 shadow-sm"
            />
          </div>
        </div>

        {/* Quick status 6-col ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-textMuted">Account</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">{currentUser?.emailVerified ? 'Verified' : 'Active'}</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              {isAdmin || isPremium ? (
                <Crown className="w-4 h-4 text-amber-400" />
              ) : isPro ? (
                <Crown className="w-4 h-4 text-emerald-400" />
              ) : (
                <Zap className="w-4 h-4 text-primary" />
              )}
              <span className="text-xs text-textMuted">Plan</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary capitalize">
              {isAdmin ? 'Admin VIP' : plan}
            </p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="w-4 h-4 text-primary" />
              <span className="text-xs text-textMuted">Push Alerts</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">{isSubscribed ? 'Active' : 'Inactive'}</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-sky-400" />
              <span className="text-xs text-textMuted">Telegram</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">
              {telegramStatus?.configured ? 'Connected' : 'Off'}
            </p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-primary" />
              <span className="text-xs text-textMuted">Watchlist</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">{watchlist.length} scripts</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-textMuted">Public Baskets</span>
            </div>
            <p className="text-sm font-semibold text-textPrimary">{myBaskets.length} published</p>
          </div>
        </div>
      </div>

      {/* Page-level quick jump */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-2.5 mb-6 bg-background/90 backdrop-blur-xl border-y border-border/60">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <SectionAnchor href="profile" icon={User} label="Profile" />
          <SectionAnchor href="membership" icon={Crown} label="Membership & Limits" />
          <SectionAnchor href="baskets" icon={Share2} label="Shared Baskets" />
          <SectionAnchor href="notifications" icon={Bell} label="Notifications" />
          <SectionAnchor href="categories" icon={Filter} label="Categories" />
          <SectionAnchor href="telegram" icon={Send} label="Telegram" />
          <SectionAnchor href="watchlist" icon={Download} label="Watchlist" />
          <SectionAnchor href="appearance" icon={Moon} label="Appearance" />
          <SectionAnchor href="account" icon={AlertTriangle} label="Account" />
        </div>
      </div>

      {/* Main content sections */}
      <div className="space-y-6">
        
        {/* 1. Profile */}
        <Section
          id="profile"
          title="Profile"
          icon={User}
          description="Manage your identity and authentication details."
          badge={currentUser?.emailVerified ? <StatusBadge tone="success"><CheckCircle className="w-3 h-3" /> Verified</StatusBadge> : <StatusBadge tone="neutral">Active User</StatusBadge>}
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
                <p className="text-xs text-textMuted">Your account credentials are encrypted with Firebase Auth.</p>
                <SaveButton saving={savingProfile} dirty={profileDirty} onClick={handleSaveProfile}>
                  Save Profile
                </SaveButton>
              </div>
            </form>
          </div>
        </Section>

        {/* 2. Membership & Quota Limits */}
        <Section
          id="membership"
          title="Membership & Quota Limits"
          icon={Crown}
          description="Inspect your active tier, real-time quota usage, and institutional entitlements."
          badge={
            isAdmin ? (
              <StatusBadge tone="success"><ShieldCheck className="w-3 h-3 text-emerald-400" /> Admin VIP</StatusBadge>
            ) : isPremium ? (
              <StatusBadge tone="primary"><Crown className="w-3 h-3 text-amber-400" /> Premium HNI</StatusBadge>
            ) : isPro ? (
              <StatusBadge tone="success"><Crown className="w-3 h-3 text-emerald-400" /> Pro Trader</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Basic Plan</StatusBadge>
            )
          }
        >
          <div className="space-y-6">
            {/* Tier Hero Banner */}
            <div className={clsx(
              "rounded-2xl p-5 border relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4",
              isAdmin || isPremium ? "bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-primary/10 border-amber-500/30"
              : isPro ? "bg-gradient-to-r from-emerald-500/10 via-primary/10 to-sky-500/10 border-emerald-500/30"
              : "bg-surface border-border"
            )}>
              <div className="flex items-start gap-4 z-10">
                <div className={clsx(
                  "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border shadow-inner",
                  isAdmin || isPremium ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  : isPro ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "bg-primary/10 text-primary border-primary/20"
                )}>
                  {isAdmin || isPremium ? <Crown className="w-6 h-6" /> : isPro ? <Crown className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-textPrimary capitalize">
                      {isAdmin ? 'System Administrator Tier' : `${plan} Membership Tier`}
                    </h3>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                      {planStatus === 'active' ? 'Active' : planStatus}
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mt-1 leading-relaxed max-w-xl">
                    {isAdmin
                      ? 'You hold unrestricted root administrative authority across all features, scrapers, models, and quotas.'
                      : isPremium
                      ? 'Unlimited watchlist scrips, unlimited Gemini AI PDF vision summaries, unlimited family PANs, and VIP priority.'
                      : isPro
                      ? '50 watchlist scrips, unlimited institutional AI analysis, 10 family PANs, and 10 shareable public baskets.'
                      : 'Free starter tier with 5 watchlist scrips, 3 daily Gemini AI statutory analyses, and 3 shareable curated baskets.'}
                  </p>
                  {planExpiresAt && (
                    <p className="text-[11px] font-mono text-textMuted mt-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      Plan valid until: {new Date(planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 z-10">
                <button
                  type="button"
                  onClick={() => navigate('/plans')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-xs transition shadow-md shadow-primary/20"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                  <span>{plan === 'basic' ? 'Upgrade to Pro / HNI' : 'Manage Subscription'}</span>
                </button>
              </div>
            </div>

            {/* 4 Quota Usage Meters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Watchlist Meter */}
              <div className="bg-background/50 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-textMuted flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-primary" />
                    Watchlist Capacity
                  </span>
                  <span className="text-xs font-mono font-bold text-textPrimary">
                    {watchlist.length} / {maxWatch === Infinity ? '∞' : maxWatch}
                  </span>
                </div>
                <div className="w-full bg-surface border border-border/80 h-2 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-500",
                      watchPct >= 100 ? "bg-amber-400" : "bg-primary"
                    )}
                    style={{ width: maxWatch === Infinity ? '10%' : `${watchPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-textMuted">
                  {maxWatch === Infinity ? 'Unlimited scrip tracking' : `${Math.max(0, maxWatch - watchlist.length)} available slots`}
                </p>
              </div>

              {/* AI Quota Meter */}
              <div className="bg-background/50 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-textMuted flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Daily Gemini AI Vision
                  </span>
                  <span className="text-xs font-mono font-bold text-textPrimary">
                    {dailyAiCount} / {maxAi === Infinity ? '∞' : maxAi}
                  </span>
                </div>
                <div className="w-full bg-surface border border-border/80 h-2 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-500",
                      aiPct >= 100 ? "bg-amber-400" : "bg-primary"
                    )}
                    style={{ width: maxAi === Infinity ? '15%' : `${aiPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-textMuted">
                  {maxAi === Infinity ? 'Unlimited PDF filings' : 'Quota resets midnight IST'}
                </p>
              </div>

              {/* Family PANs Meter */}
              <div className="bg-background/50 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-textMuted flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Family PAN Accounts
                  </span>
                  <span className="text-xs font-mono font-bold text-textPrimary">
                    {planLimits?.maxFamilyPans === Infinity ? 'Unlimited' : planLimits?.maxFamilyPans || 1} PANs
                  </span>
                </div>
                <div className="w-full bg-surface border border-border/80 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: planLimits?.maxFamilyPans === Infinity ? '100%' : '20%' }}
                  />
                </div>
                <p className="text-[11px] text-textMuted">
                  Event-driven auto allotment checks
                </p>
              </div>

              {/* Shareable Baskets Meter */}
              <div className="bg-background/50 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-textMuted flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5 text-sky-400" />
                    Public Baskets
                  </span>
                  <span className="text-xs font-mono font-bold text-textPrimary">
                    {myBaskets.length} / {maxBaskets === Infinity ? '∞' : maxBaskets}
                  </span>
                </div>
                <div className="w-full bg-surface border border-border/80 h-2 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-500",
                      basketPct >= 100 ? "bg-amber-400" : "bg-sky-500"
                    )}
                    style={{ width: maxBaskets === Infinity ? '20%' : `${basketPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-textMuted">
                  {maxBaskets === Infinity ? 'Unlimited viral baskets' : `${Math.max(0, maxBaskets - myBaskets.length)} basket slots open`}
                </p>
              </div>

            </div>
          </div>
        </Section>

        {/* 3. Shared Watchlists & Public Baskets */}
        <Section
          id="baskets"
          title="Shared Watchlists & Curated Baskets"
          icon={Share2}
          description="Manage public links you have created. Anyone with these links can view live announcements and import stocks into their watchlist in 1 tap."
          badge={<StatusBadge tone="primary">{myBaskets.length} published</StatusBadge>}
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
              <p className="text-xs text-textMuted leading-relaxed max-w-xl">
                Share high-conviction ideas with friends, WhatsApp groups, or clients. Each basket features live disclosures and 1-tap import.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadMyBaskets}
                  disabled={basketsLoading}
                  className="p-2 rounded-xl border border-border hover:bg-surface text-textMuted hover:text-textPrimary transition"
                  title="Refresh baskets list"
                >
                  <RefreshCw className={clsx("w-3.5 h-3.5", basketsLoading && "animate-spin text-primary")} />
                </button>
                <button
                  type="button"
                  onClick={() => setShareBasketOpen(true)}
                  disabled={watchlist.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-xl text-xs font-semibold transition disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Share My Watchlist</span>
                </button>
              </div>
            </div>

            {/* Baskets Grid / List */}
            {basketsLoading && myBaskets.length === 0 ? (
              <div className="py-8 text-center">
                <Spinner size="md" className="mx-auto" />
                <p className="text-xs text-textMuted mt-2">Loading your published baskets...</p>
              </div>
            ) : myBaskets.length === 0 ? (
              <div className="text-center py-10 rounded-2xl border border-dashed border-border bg-background/30 p-6 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                  <Share2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-textPrimary">No Shared Baskets Yet</h4>
                <p className="text-xs text-textMuted max-w-md mx-auto leading-relaxed">
                  You haven't published any public baskets. You can share your entire watchlist or select high-conviction stocks to create a shareable link.
                </p>
                <button
                  type="button"
                  onClick={() => setShareBasketOpen(true)}
                  disabled={watchlist.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-primary/20 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Publish My First Basket</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myBaskets.map((basket) => {
                  const slug = basket.slug || basket.id
                  const isCopied = copiedSlug === slug
                  return (
                    <div
                      key={slug}
                      className="rounded-2xl border border-border bg-background/50 hover:border-primary/40 transition-all p-4 flex flex-col justify-between space-y-3 shadow-sm group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
                            {basket.category || 'Curated'}
                          </span>
                          <span className="text-[11px] text-textMuted font-mono">
                            {basket.scriptsCount || 0} stocks
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-textPrimary group-hover:text-primary transition-colors">
                          {basket.title}
                        </h4>
                        {basket.description && (
                          <p className="text-xs text-textMuted line-clamp-2 leading-relaxed">
                            {basket.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-[11px] text-textMuted pt-1">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5 text-primary" />
                            {basket.viewsCount || 0} views
                          </span>
                          <span className="flex items-center gap-1">
                            <Download className="w-3.5 h-3.5 text-emerald-400" />
                            {basket.importsCount || 0} imports
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyBasketLink(slug)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-textPrimary hover:bg-surfaceHover text-xs font-semibold transition"
                            title="Copy public link"
                          >
                            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{isCopied ? 'Copied' : 'Copy Link'}</span>
                          </button>
                          <a
                            href={`/basket/${slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg border border-border hover:bg-surface text-textMuted hover:text-textPrimary transition"
                            title="Open public basket page"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        <button
                          type="button"
                          onClick={() => setDeleteBasketSlug(slug)}
                          className="p-1.5 rounded-lg text-textMuted hover:text-red-400 hover:bg-red-500/10 transition"
                          title="Delete basket"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Section>

        {/* 4. Notifications */}
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
                Notification preferences are synchronized with Upstash Redis and MongoDB hot watcher filters.
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

        {/* 5. Alert Categories */}
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

        {/* 6. Telegram Notifications */}
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
                        ? 'Eligible StockWatch notifications are routed to your configured Telegram destination.'
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

        {/* 7. Watchlist Management */}
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
                Export your tracked company list as a standard CSV spreadsheet or clear your stored watchlist data.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleExportWatchlist}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-surface hover:bg-white/5 border border-border text-textPrimary rounded-xl text-sm font-semibold transition-colors shadow-sm"
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

        {/* 8. Appearance & Theme */}
        <Section
          id="appearance"
          title="Appearance & Theme"
          icon={Moon}
          description="Customize the platform visual styling, ambient contrast, and color palette."
          badge={<StatusBadge tone="primary">{currentTheme.toUpperCase()} Mode</StatusBadge>}
        >
          <div className="space-y-4">
            <p className="text-xs text-textMuted leading-relaxed">
              Choose your preferred visual presentation. Changes are saved locally and applied instantaneously across all tabs.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'dark',
                  name: 'Dark Mode',
                  desc: 'High contrast institutional slate theme for reduced eye strain.',
                  icon: Moon,
                },
                {
                  id: 'light',
                  name: 'Light Mode',
                  desc: 'Crisp, high-clarity paper layout with elevated card borders.',
                  icon: Sun,
                },
                {
                  id: 'system',
                  name: 'System Default',
                  desc: 'Automatically adapts to your operating system appearance.',
                  icon: Laptop,
                },
              ].map((th) => {
                const isSelected = currentTheme === th.id
                const Icon = th.icon
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => handleThemeChange(th.id)}
                    className={clsx(
                      "p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between space-y-3",
                      isSelected
                        ? "bg-primary/10 border-primary shadow-sm shadow-primary/20"
                        : "bg-background/50 border-border hover:border-border/80 hover:bg-background"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className={clsx(
                        "w-9 h-9 rounded-xl flex items-center justify-center border",
                        isSelected ? "bg-primary text-white border-primary" : "bg-surface text-textMuted border-border"
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {isSelected && <CheckCircle className="w-4 h-4 text-primary" />}
                    </div>
                    <div>
                      <h4 className={clsx("text-sm font-bold", isSelected ? "text-primary" : "text-textPrimary")}>
                        {th.name}
                      </h4>
                      <p className="text-xs text-textMuted mt-1 leading-relaxed">
                        {th.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </Section>

        {/* 9. Account Danger Zone */}
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
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-surface hover:bg-white/5 border border-border text-textPrimary rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>

              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-danger hover:bg-danger/90 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete Account
              </button>
            </div>
          </div>
        </Section>
      </div>

      {/* Share Basket Modal */}
      <ShareBasketModal
        isOpen={shareBasketOpen}
        onClose={() => {
          setShareBasketOpen(false)
          loadMyBaskets()
        }}
        watchlist={watchlist}
      />

      {/* Delete Basket Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteBasketSlug)}
        onClose={() => setDeleteBasketSlug(null)}
        onConfirm={() => handleDeleteBasket(deleteBasketSlug)}
        title="Delete Public Basket"
        message="Are you sure you want to delete this curated basket? Anyone using this public link will no longer be able to access or import it."
        confirmText="Delete Basket"
        danger
      />

      {/* Clear Watchlist Confirmation */}
      <ConfirmDialog
        isOpen={clearConfirm}
        onClose={() => setClearConfirm(false)}
        onConfirm={handleClearWatchlist}
        title="Clear Watchlist"
        message="Are you sure you want to clear your entire watchlist? This action cannot be undone."
        confirmText="Clear Watchlist"
        danger
      />

      {/* Delete Account Confirmation */}
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
