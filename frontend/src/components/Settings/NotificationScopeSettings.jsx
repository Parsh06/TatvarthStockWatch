import { useState } from 'react'
import { Radio, Globe, BookMarked, BellOff, AlertTriangle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { savePrefs } from '../../services/alertService'

/**
 * NotificationScopeSettings
 *
 * Presents a 3-state radio group for the notification scope:
 *   WATCHLIST_ONLY | ALL_ANNOUNCEMENTS | NONE
 *
 * Maps to the backend prefs fields:
 *   notifyWatchlist        (boolean)
 *   notifyAllAnnouncements (boolean)
 *
 * Normalization:
 *   WATCHLIST_ONLY    → { notifyWatchlist: true,  notifyAllAnnouncements: false }
 *   ALL_ANNOUNCEMENTS → { notifyWatchlist: false,  notifyAllAnnouncements: true  }
 *   NONE              → { notifyWatchlist: false, notifyAllAnnouncements: false }
 */

const SCOPES = [
  {
    id:    'WATCHLIST_ONLY',
    label: 'Watchlist announcements',
    desc:  'Notify me when companies in my Watchlist publish announcements on BSE or NSE.',
    icon:  BookMarked,
    color: 'text-primary',
    bg:    'bg-primary/10 border-primary/30',
  },
  {
    id:    'ALL_ANNOUNCEMENTS',
    label: 'All market announcements',
    desc:  'Notify me about every announcement from BSE/NSE across the entire market. Your category filters still apply.',
    icon:  Globe,
    color: 'text-amber-400',
    bg:    'bg-amber-400/10 border-amber-400/30',
    warning: true,
  },
  {
    id:    'NONE',
    label: 'None — disable announcement notifications',
    desc:  'Stop receiving announcement alerts. Price alerts and other notification types are unaffected.',
    icon:  BellOff,
    color: 'text-textMuted',
    bg:    'bg-surface border-border',
  },
]

function prefsToScope(prefs) {
  if (prefs?.notifyAllAnnouncements === true) return 'ALL_ANNOUNCEMENTS'
  if (prefs?.notifyWatchlist !== false)       return 'WATCHLIST_ONLY'
  return 'NONE'
}

function scopeToPrefsFields(scope) {
  switch (scope) {
    case 'ALL_ANNOUNCEMENTS': return { notifyWatchlist: false, notifyAllAnnouncements: true  }
    case 'WATCHLIST_ONLY':   return { notifyWatchlist: true,  notifyAllAnnouncements: false }
    case 'NONE':             return { notifyWatchlist: false, notifyAllAnnouncements: false }
    default:                 return { notifyWatchlist: true,  notifyAllAnnouncements: false }
  }
}

export default function NotificationScopeSettings({ prefs, onPrefsChange }) {
  const [saving, setSaving]           = useState(false)
  const [confirmAll, setConfirmAll]   = useState(false) // dialog for ALL scope warning

  const currentScope = prefsToScope(prefs)

  async function handleSelect(scope) {
    // Show confirmation dialog before enabling ALL mode
    if (scope === 'ALL_ANNOUNCEMENTS' && currentScope !== 'ALL_ANNOUNCEMENTS') {
      setConfirmAll(true)
      return
    }
    await applyScope(scope)
  }

  async function applyScope(scope) {
    if (scope === currentScope) return
    setSaving(true)
    const prevPrefs = { ...prefs }

    // Optimistic update
    const fields = scopeToPrefsFields(scope)
    onPrefsChange({ ...prefs, ...fields })

    try {
      const updated = await savePrefs({ ...prefs, ...fields })
      onPrefsChange(updated)
      toast.success('Notification scope updated')
    } catch (err) {
      // Rollback on failure
      onPrefsChange(prevPrefs)
      toast.error('Failed to save — scope restored')
    } finally {
      setSaving(false)
      setConfirmAll(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-textPrimary">Announcement Notification Scope</p>
        <p className="text-xs text-textMuted mt-0.5">
          Choose which announcements StockWatch should send to your notification channels.
        </p>
      </div>

      {/* Scope radio group */}
      <div className="space-y-2">
        {SCOPES.map(({ id, label, desc, icon: Icon, color, bg, warning }) => {
          const isSelected = currentScope === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleSelect(id)}
              disabled={saving}
              className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all duration-200
                ${isSelected ? bg : 'bg-background border-border hover:border-border/80 hover:bg-white/3'}
                ${saving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-[1px]'}
              `}
            >
              {/* Radio indicator */}
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                ${isSelected ? `border-current ${color}` : 'border-textMuted/40'}`}
              >
                {isSelected && (
                  <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-current' : ''} ${color}`} />
                )}
              </div>

              {/* Icon + text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? color : 'text-textMuted'}`} />
                  <span className={`text-sm font-medium ${isSelected ? color : 'text-textPrimary'}`}>{label}</span>
                  {isSelected && saving && (
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                  {isSelected && !saving && (
                    <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
                  )}
                </div>
                <p className="text-xs text-textMuted mt-1">{desc}</p>
                {warning && isSelected && (
                  <div className="mt-2 flex items-start gap-1.5 p-2 bg-amber-400/5 border border-amber-400/20 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-400/90">
                      This may generate many notifications. Category and subcategory exclusions still apply.
                    </p>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Scope indicator badge */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-textMuted">Current scope:</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border
          ${currentScope === 'ALL_ANNOUNCEMENTS' ? 'bg-amber-400/10 text-amber-400 border-amber-400/30' :
            currentScope === 'WATCHLIST_ONLY'   ? 'bg-primary/10 text-primary border-primary/30' :
                                                  'bg-surface text-textMuted border-border'}`}>
          {currentScope === 'ALL_ANNOUNCEMENTS' ? 'All Market' :
           currentScope === 'WATCHLIST_ONLY'    ? 'Watchlist Only' : 'None'}
        </span>
      </div>

      {/* ALL mode confirmation dialog */}
      {confirmAll && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-400/15 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-textPrimary text-sm">Enable All Market Announcements?</h3>
              </div>
            </div>
            <p className="text-sm text-textMuted mb-3">
              BSE and NSE publish <strong className="text-textPrimary">thousands of announcements</strong> per day.
              Enabling this will send you notifications for all of them.
            </p>
            <p className="text-sm text-textMuted mb-5">
              Your <strong className="text-textPrimary">category and subcategory exclusions</strong> will continue
              to apply — blocked categories will never be notified.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAll(false)}
                className="flex-1 py-2.5 border border-border text-textMuted hover:text-textPrimary hover:bg-white/5 rounded-xl text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={() => applyScope('ALL_ANNOUNCEMENTS')}
                disabled={saving}
                className="flex-1 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 font-semibold rounded-xl text-sm transition disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Enable All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
