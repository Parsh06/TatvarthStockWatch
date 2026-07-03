import { useState, useEffect } from 'react'
import { Bell, BellOff, TrendingUp, TrendingDown, X, Lock } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import { useTier } from '../../contexts/TierContext'
import { useWatchlist } from '../../contexts/WatchlistContext'
import { setScriptAlert } from '../../services/alertService'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

export default function SetAlertModal({ script, rate, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const { isPremium }   = useTier()
  const { refresh }     = useWatchlist()
  const navigate        = useNavigate()

  const [alertAbove,   setAlertAbove]   = useState('')
  const [alertBelow,   setAlertBelow]   = useState('')
  const [alertEnabled, setAlertEnabled] = useState(true)
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    if (script) {
      setAlertAbove(script.alertAbove  != null ? String(script.alertAbove)  : '')
      setAlertBelow(script.alertBelow  != null ? String(script.alertBelow)  : '')
      setAlertEnabled(script.alertEnabled !== false)
    }
  }, [script])

  if (!script) return null

  const ltp = rate?.ltp

  async function handleSave(e) {
    e.preventDefault()
    if (!isPremium) return
    setSaving(true)
    try {
      const payload = {
        alertAbove:   alertAbove  !== '' ? parseFloat(alertAbove)  : null,
        alertBelow:   alertBelow  !== '' ? parseFloat(alertBelow)  : null,
        alertEnabled,
      }
      await setScriptAlert(currentUser?.uid, script.id, payload)
      // Refresh watchlist so the updated thresholds persist across navigation
      await refresh()
      toast.success(`Alert set for ${script.scriptName}`)
      onSaved?.({ ...script, ...payload })
      onClose()
    } catch (e) {
      toast.error(`Failed to save alert: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    try {
      await setScriptAlert(currentUser?.uid, script.id, { alertAbove: null, alertBelow: null, alertEnabled: false })
      await refresh()
      toast.success('Alert cleared')
      onSaved?.({ ...script, alertAbove: null, alertBelow: null, alertEnabled: false })
      onClose()
    } catch {
      toast.error('Failed to clear alert')
    } finally {
      setSaving(false)
    }
  }

  const hasExisting = script.alertAbove != null || script.alertBelow != null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500/15 rounded-lg flex items-center justify-center">
              <Bell className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-textPrimary text-sm">{script.scriptName}</p>
              <p className="text-xs text-textMuted">{script.ltdCode || script.bseCode}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textPrimary transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current price */}
        {ltp != null && (
          <div className="mx-5 mt-4 px-4 py-3 bg-background rounded-xl flex items-center justify-between">
            <span className="text-xs text-textMuted">Current LTP</span>
            <div className="text-right">
              <span className="text-lg font-bold text-textPrimary">₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              {rate?.pctChange != null && (
                <span className={clsx('ml-2 text-xs font-semibold', rate.pctChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {rate.pctChange >= 0 ? '+' : ''}{rate.pctChange.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Premium gate */}
        {!isPremium ? (
          <div className="px-5 py-6 text-center space-y-4">
            <div className="w-12 h-12 bg-amber-400/10 rounded-full flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-textPrimary mb-1">Premium Feature</p>
              <p className="text-sm text-textMuted">Price alerts are available on the Premium plan. Upgrade to get notified when stocks cross your target price.</p>
            </div>
            <button
              onClick={() => { onClose(); navigate('/premium') }}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold rounded-xl transition"
            >
              Upgrade to Premium
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="px-5 py-4 space-y-4">

            {/* Enable toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-textPrimary">Alert enabled</p>
                <p className="text-xs text-textMuted">Pause without deleting thresholds</p>
              </div>
              <div
                onClick={() => setAlertEnabled(!alertEnabled)}
                className={clsx('relative w-10 h-5 rounded-full transition-colors', alertEnabled ? 'bg-primary' : 'bg-border')}
              >
                <div className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', alertEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
              </div>
            </label>

            {/* Alert Above */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-textMuted mb-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Alert when price goes ABOVE
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={alertAbove}
                  onChange={(e) => setAlertAbove(e.target.value)}
                  placeholder={ltp ? `e.g. ${(ltp * 1.05).toFixed(0)}` : 'Enter price'}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-4 py-2.5 text-textPrimary placeholder-textMuted/40 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm"
                />
              </div>
              {alertAbove && ltp && (
                <p className="mt-1 text-xs text-emerald-400/80">
                  +{((parseFloat(alertAbove) - ltp) / ltp * 100).toFixed(1)}% from current price
                </p>
              )}
            </div>

            {/* Alert Below */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-textMuted mb-1.5">
                <TrendingDown className="w-4 h-4 text-red-400" />
                Alert when price goes BELOW
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={alertBelow}
                  onChange={(e) => setAlertBelow(e.target.value)}
                  placeholder={ltp ? `e.g. ${(ltp * 0.95).toFixed(0)}` : 'Enter price'}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-4 py-2.5 text-textPrimary placeholder-textMuted/40 focus:outline-none focus:ring-1 focus:ring-red-500 text-sm"
                />
              </div>
              {alertBelow && ltp && (
                <p className="mt-1 text-xs text-red-400/80">
                  {((parseFloat(alertBelow) - ltp) / ltp * 100).toFixed(1)}% from current price
                </p>
              )}
            </div>

            <p className="text-xs text-textMuted/60 bg-background/60 rounded-lg px-3 py-2">
              You'll be notified via your enabled channels (Email / Telegram) when the price crosses these thresholds during the next rates fetch.
            </p>

            <div className="flex gap-2 pt-1">
              {hasExisting && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 border border-border text-textMuted hover:text-danger hover:border-danger/40 rounded-xl text-sm transition"
                >
                  <BellOff className="w-4 h-4" />
                  Clear
                </button>
              )}
              <button
                type="submit"
                disabled={saving || (!alertAbove && !alertBelow)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition"
              >
                {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Save Alert
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
