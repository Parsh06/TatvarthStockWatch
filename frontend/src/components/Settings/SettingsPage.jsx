import { useState, useEffect, useCallback } from 'react'
import { User, Lock, Bell, Download, Trash2, AlertTriangle, Send, CheckCircle, XCircle, Save, Activity, Filter, ChevronDown, ChevronRight } from 'lucide-react'
import { updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth'
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

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-primary/15 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-semibold text-textPrimary">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const { currentUser, logout } = useAuth()
  const { watchlist, clearWatchlist } = useWatchlist()
  const { isSupported, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = useWebPush()
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState({})
  const [savingPw, setSavingPw] = useState(false)

  const [notifPrefs, setNotifPrefs] = useState({
    telegramEnabled: true,
    telegramChatId: '',
    inAppEnabled: true,
    frequency: 'realtime',
    blockedCategories: [],
  })
  const [savingPrefs, setSavingPrefs] = useState(false)

  const loadPrefs = useCallback(async () => {
    try {
      const p = await getPrefs(currentUser?.uid)
      if (p && Object.keys(p).length) setNotifPrefs((prev) => ({ ...prev, ...p }))
    } catch {}
  }, [currentUser])

  useEffect(() => { loadPrefs() }, [loadPrefs])

  const [clearConfirm, setClearConfirm]   = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [expandedCats, setExpandedCats] = useState({})

  const toggleBlockedCategory = (name) => {
    setNotifPrefs((prev) => {
      const blocked = prev.blockedCategories || []
      const isBlocked = blocked.includes(name)
      return {
        ...prev,
        blockedCategories: isBlocked 
          ? blocked.filter(c => c !== name) 
          : [...blocked, name]
      }
    })
  }


  // Telegram status
  const [telegramStatus, setTelegramStatus] = useState(null)
  const [telegramTesting, setTelegramTesting] = useState(false)
  // System health
  const [health, setHealth] = useState(null)

  useEffect(() => {
    apiClient('/api/telegram-status')
      .then(setTelegramStatus)
      .catch(() => setTelegramStatus({ configured: false, hasBotToken: false, hasChatId: false }))
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {})
  }, [])

  async function handleTelegramTest() {
    setTelegramTesting(true)
    try {
      const data = await apiClient('/api/telegram-test', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: notifPrefs.telegramChatId })
      })
      if (data.sent) toast.success('Test message sent! Check your Telegram.')
      else toast.error(data.message || data.error || 'Failed to send test message')
    } catch {
      toast.error('Could not reach backend')
    } finally {
      setTelegramTesting(false)
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
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

  async function handleChangePassword(e) {
    e.preventDefault()
    const errs = {}
    if (!pwForm.current) errs.current = 'Current password required'
    if (!pwForm.newPw || pwForm.newPw.length < 6) errs.newPw = 'Min 6 characters'
    if (pwForm.newPw !== pwForm.confirm) errs.confirm = 'Passwords do not match'
    if (Object.keys(errs).length) { setPwErrors(errs); return }
    setPwErrors({})
    setSavingPw(true)
    try {
      const cred = EmailAuthProvider.credential(currentUser.email, pwForm.current)
      await reauthenticateWithCredential(auth.currentUser, cred)
      await updatePassword(auth.currentUser, pwForm.newPw)
      toast.success('Password updated')
      setPwForm({ current: '', newPw: '', confirm: '' })
    } catch (err) {
      if (err.code === 'auth/wrong-password') toast.error('Current password is incorrect')
      else toast.error(err.message)
    } finally {
      setSavingPw(false)
    }
  }

  function handleExportWatchlist() {
    if (!watchlist.length) { toast.error('Watchlist is empty'); return }
    exportToCSV(watchlist.map(({ scriptName, ltdCode, exchange, notes }) => ({ 'Script Name': scriptName, 'LTD Code': ltdCode, Exchange: exchange, Notes: notes || '' })), 'watchlist.csv')
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
      if (err.code === 'auth/requires-recent-login') toast.error('Please sign in again before deleting your account')
      else toast.error(err.message)
    } finally {
      setDeleteConfirm(false)
    }
  }

  function InputField({ label, value, onChange, type = 'text', error, placeholder, disabled }) {
    return (
      <div>
        {label && <label className="block text-sm font-medium text-textMuted mb-1.5">{label}</label>}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full bg-background border rounded-lg px-4 py-2.5 text-textPrimary placeholder-textMuted/50 focus:outline-none focus:ring-1 focus:ring-primary text-sm disabled:opacity-50 ${error ? 'border-danger' : 'border-border'}`}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-textPrimary">Settings</h1>

      {/* Profile */}
      <Section title="Profile" icon={User}>
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
          <button
            type="submit"
            disabled={savingProfile}
            className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            {savingProfile && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Save Profile
          </button>
        </form>
      </Section>

      {/* Change Password */}
      <Section title="Change Password" icon={Lock}>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <InputField label="Current Password" type="password" value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))} error={pwErrors.current} />
          <InputField label="New Password" type="password" value={pwForm.newPw} onChange={(e) => setPwForm((f) => ({ ...f, newPw: e.target.value }))} error={pwErrors.newPw} placeholder="Min 6 characters" />
          <InputField label="Confirm New Password" type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} error={pwErrors.confirm} />
          <button
            type="submit"
            disabled={savingPw}
            className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            {savingPw && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Update Password
          </button>
        </form>
      </Section>

      {/* Notification Preferences */}
      <Section title="Notification Preferences" icon={Bell}>
        <div className="space-y-4">
          {[
            { key: 'telegramEnabled', label: 'Telegram Notifications',  desc: 'Send alerts to your configured Telegram bot' },
            { key: 'inAppEnabled',    label: 'In-App Notifications',    desc: 'Show toast notifications inside the app' },
          ].map(({ key, label, desc }) => (
            <label key={key} className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-textPrimary">{label}</p>
                <p className="text-xs text-textMuted">{desc}</p>
              </div>
              <div
                onClick={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${notifPrefs[key] ? 'bg-primary' : 'bg-border'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${notifPrefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </label>
          ))}
          {isSupported && (
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-textPrimary">Browser Notifications</p>
                <p className="text-xs text-textMuted">Receive OS-level system notifications in background</p>
              </div>
              {isSubscribed ? (
                <button
                  type="button"
                  onClick={unsubscribe}
                  disabled={pushLoading}
                  className="px-3 py-1.5 bg-danger/10 hover:bg-danger/20 text-danger text-xs font-semibold rounded-md transition disabled:opacity-50"
                >
                  {pushLoading ? 'Disabling...' : 'Disable'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={subscribe}
                  disabled={pushLoading}
                  className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-md transition disabled:opacity-50"
                >
                  {pushLoading ? 'Enabling...' : 'Enable'}
                </button>
              )}
            </label>
          )}
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-1.5">Alert Frequency</label>
            <select
              value={notifPrefs.frequency}
              onChange={(e) => setNotifPrefs((p) => ({ ...p, frequency: e.target.value }))}
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
            >
              <option value="realtime">Real-time (fire immediately)</option>
              <option value="hourly">Hourly digest</option>
              <option value="daily">Daily digest</option>
            </select>
          </div>
          <button
            onClick={async () => {
              setSavingPrefs(true)
              try {
                await savePrefs(currentUser?.uid, notifPrefs)
                toast.success('Notification preferences saved')
              } catch {
                toast.error('Failed to save preferences')
              } finally {
                setSavingPrefs(false)
              }
            }}
            disabled={savingPrefs}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
          >
            {savingPrefs
              ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Save className="w-3.5 h-3.5" />
            }
            Save Preferences
          </button>
        </div>
      </Section>

      {/* Alert Categories */}
      <Section title="Alert Categories" icon={Filter}>
        <div className="mb-4 p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <Filter className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary mb-1">Customize Your Notifications</p>
            <p className="text-xs text-textMuted">
              Check to receive alerts. Uncheck to block. <br/>
              <span className="text-emerald-500 font-semibold">Green = Active</span> | <span className="text-red-500 font-semibold">Red = Blocked</span>
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-6 border border-border rounded-lg p-2 bg-background">
          {Object.entries(ALERT_CATEGORIES).map(([catName, subCats]) => {
            const isCatBlocked = (notifPrefs.blockedCategories || []).includes(catName)
            const isExpanded = expandedCats[catName]
            
            return (
              <div key={catName} className="rounded-md border border-border/50 overflow-hidden bg-surface">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <button 
                      type="button"
                      onClick={() => setExpandedCats(p => ({ ...p, [catName]: !p[catName] }))}
                      className="p-1 hover:bg-white/5 rounded transition text-textMuted hover:text-textPrimary disabled:opacity-30"
                      disabled={subCats.length === 0}
                    >
                      {subCats.length > 0 ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <div className="w-4 h-4" />}
                    </button>
                    
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <div 
                        onClick={() => toggleBlockedCategory(catName)}
                        className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${!isCatBlocked ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-red-500/10 border-red-500/30'}`}
                      >
                        {!isCatBlocked ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3 h-3 text-red-500/70" />}
                      </div>
                      <span className={`text-sm font-medium transition-colors ${!isCatBlocked ? 'text-textPrimary' : 'text-textMuted'}`}>{catName}</span>
                    </label>
                  </div>
                </div>
                
                {isExpanded && subCats.length > 0 && (
                  <div className="px-12 py-2 pb-4 space-y-2 border-t border-border/50 bg-background/50">
                    {subCats.map(subCat => {
                      const isSubBlocked = (notifPrefs.blockedCategories || []).includes(subCat) || isCatBlocked
                      return (
                        <label key={subCat} className="flex items-center gap-2 cursor-pointer select-none py-1">
                          <div 
                            onClick={() => !isCatBlocked && toggleBlockedCategory(subCat)}
                            className={`w-4 h-4 rounded flex items-center justify-center transition-colors border ${isCatBlocked ? 'opacity-50 cursor-not-allowed' : ''} ${!isSubBlocked ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-red-500/10 border-red-500/30'}`}
                          >
                            {!isSubBlocked ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-2.5 h-2.5 text-red-500/70" />}
                          </div>
                          <span className={`text-xs transition-colors ${!isSubBlocked ? 'text-textPrimary' : 'text-textMuted'}`}>{subCat}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={async () => {
            setSavingPrefs(true)
            try {
              await savePrefs(currentUser?.uid, notifPrefs)
              toast.success('Categories saved')
            } catch {
              toast.error('Failed to save categories')
            } finally {
              setSavingPrefs(false)
            }
          }}
          disabled={savingPrefs}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
        >
          {savingPrefs
            ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Save className="w-3.5 h-3.5" />
          }
          Save Alert Categories
        </button>
      </Section>

      {/* Telegram */}
      <Section title="Telegram Notifications" icon={Send}>
        {/* Status badge */}
        <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-background border border-border">
          {telegramStatus === null ? (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : telegramStatus.configured ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-textMuted/40 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-textPrimary">
              {telegramStatus === null ? 'Checking…' : telegramStatus.configured ? 'Connected' : 'Not configured'}
            </p>
            {telegramStatus && !telegramStatus.configured && (
              <p className="text-xs text-textMuted mt-0.5">
                {!telegramStatus.hasBotToken
                  ? 'TELEGRAM_BOT_TOKEN is missing on the server'
                  : 'You have not set your Chat ID yet. Please enter it below.'}
              </p>
            )}
            {telegramStatus?.configured && (
              <p className="text-xs text-textMuted mt-0.5">Alerts will be sent to your Telegram when news is fetched</p>
            )}
          </div>
          {telegramStatus?.configured && (
            <button
              onClick={handleTelegramTest}
              disabled={telegramTesting}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium transition disabled:opacity-60"
            >
              {telegramTesting
                ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                : <Send className="w-3 h-3" />
              }
              Send Test
            </button>
          )}
        </div>
        
        {/* Personal Chat ID Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-textPrimary mb-1.5">Your Telegram Chat ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={notifPrefs.telegramChatId || ''}
              onChange={(e) => setNotifPrefs(p => ({ ...p, telegramChatId: e.target.value }))}
              placeholder="e.g. 123456789"
              className="bg-background border border-border rounded-lg px-4 py-2 text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary text-sm flex-1 max-w-sm"
            />
            <button
              onClick={async () => {
                setSavingPrefs(true)
                try {
                  await savePrefs(currentUser?.uid, notifPrefs)
                  toast.success('Chat ID saved successfully!')
                  // Refresh status
                  const status = await apiClient('/api/telegram-status')
                  setTelegramStatus(status)
                } catch {
                  toast.error('Failed to save Chat ID')
                } finally {
                  setSavingPrefs(false)
                }
              }}
              disabled={savingPrefs}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
            >
              {savingPrefs ? 'Saving...' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-textMuted mt-1.5">Leave blank to use the global admin Chat ID.</p>
        </div>

        {/* Setup instructions */}
        <div className="space-y-3 text-sm">
          <p className="text-textMuted font-medium">How to get your Chat ID:</p>
          <ol className="space-y-2.5 text-textMuted list-none">
            {[
              { n: 1, text: 'Open Telegram and search for ', link: { label: '@userinfobot', href: 'https://t.me/userinfobot' }, after: ' — start it and it replies with your Chat ID.' },
              { n: 2, text: 'Copy your ID and paste it in the box above.' },
              { n: 3, text: 'Click Save, then click Send Test.' },
            ].map(({ n, text, link, after }) => (
              <li key={n} className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">{n}</span>
                <span>
                  {text}
                  {link && <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{link.label}</a>}
                  {after}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-textMuted/70">
            For a group chat: add the bot to the group, send a message, then use the group's Chat ID (starts with <code className="text-textMuted bg-background px-1 rounded">-</code> for groups).
          </p>
        </div>
      </Section>

      {/* Watchlist management */}
      <Section title="Watchlist" icon={Download}>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportWatchlist}
            className="flex items-center gap-2 px-4 py-2 border border-border text-textMuted hover:text-textPrimary hover:border-primary/50 rounded-lg text-sm transition"
          >
            <Download className="w-4 h-4" />
            Export Watchlist CSV
          </button>
          <button
            onClick={() => setClearConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 border border-danger/30 text-danger hover:bg-danger/10 rounded-lg text-sm transition"
          >
            <Trash2 className="w-4 h-4" />
            Clear All Scripts
          </button>
        </div>
      </Section>

      {/* System status */}
      <Section title="System Status" icon={Activity}>
        {health ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Backend',       ok: true,              value: `Online · ${Math.floor(health.uptime / 60)}m uptime` },
              { label: 'Auth Mode',     ok: true,              value: health.authMode === 'secure' ? 'Firebase (Secure)' : 'Local (Dev)' },
              { label: 'Rates Store',   ok: true,              value: health.ratesStore === 'redis' ? 'Upstash Redis' : 'Local JSON' },
              { label: 'Telegram',      ok: health.telegramOk, value: health.telegramOk ? 'Configured' : 'Not configured' },
              { label: 'Watchlist',     ok: true,              value: `${health.scriptCount} scripts` },
            ].map(({ label, ok, value }) => (
              <div key={label} className="flex items-start gap-2.5 p-3 bg-background border border-border/50 rounded-lg">
                {ok
                  ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  : <XCircle    className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                }
                <div>
                  <p className="text-xs font-semibold text-textPrimary">{label}</p>
                  <p className="text-xs text-textMuted mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-textMuted">Loading health status…</p>
        )}
      </Section>

      {/* Danger zone */}
      <Section title="Account" icon={AlertTriangle}>
        <div className="space-y-4">
          <div className="p-4 border border-border rounded-lg bg-background">
            <p className="text-sm font-medium text-textPrimary mb-1">Sign Out</p>
            <p className="text-xs text-textMuted mb-3">Sign out of your account on this device.</p>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-white/5 border border-border text-textPrimary rounded-lg text-sm font-medium transition"
            >
              Sign Out
            </button>
          </div>
          
          <div className="p-4 border border-danger/30 rounded-lg bg-danger/5">
            <p className="text-sm font-medium text-textPrimary mb-1">Delete Account</p>
            <p className="text-xs text-textMuted mb-3">Permanently delete your account and all associated data. This cannot be undone.</p>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-danger hover:bg-danger/90 text-white rounded-lg text-sm font-medium transition"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
        </div>
      </Section>

      {/* Confirm dialogs */}
      <ConfirmDialog
        isOpen={clearConfirm}
        title="Clear Watchlist"
        message="This will permanently remove all scripts. This cannot be undone."
        confirmLabel="Clear All"
        onConfirm={handleClearWatchlist}
        onCancel={() => setClearConfirm(false)}
        danger
      />
      <ConfirmDialog
        isOpen={deleteConfirm}
        title="Delete Account"
        message="Your account and all data will be permanently deleted. This cannot be undone."
        confirmLabel="Delete Account"
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteConfirm(false)}
        danger
      />
    </div>
  )
}
