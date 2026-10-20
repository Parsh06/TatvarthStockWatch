import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Crown, ShieldAlert, Check, Loader2, Sparkles, Calendar, FileText, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'

const PLANS = [
  {
    id: 'basic',
    name: 'Basic (Free)',
    price: '₹0',
    color: 'slate',
    features: ['5 Watchlist Scrips', '3 Daily AI Analyses', '1 Family PAN', 'Basic Push Alerts'],
  },
  {
    id: 'pro',
    name: 'Pro Trader',
    price: '₹999/mo',
    color: 'primary',
    badge: 'POPULAR',
    features: ['50 Watchlist Scrips', 'Unlimited AI Analyses', '10 Family PANs', 'CSV/Excel Export', '5 Curated Baskets'],
  },
  {
    id: 'premium',
    name: 'Premium HNI',
    price: '₹1,999/mo',
    color: 'amber',
    badge: 'INSTITUTIONAL',
    features: ['Unlimited Watchlist', 'Priority Gemini AI Engine', 'Unlimited Family PANs', 'Allotment Radar', 'Unlimited Baskets'],
  },
]

const DURATIONS = [
  { id: '1m', label: '1 Month', days: '+30 days' },
  { id: '3m', label: '3 Months', days: '+90 days' },
  { id: '6m', label: '6 Months', days: '+180 days' },
  { id: '1y', label: '1 Year', days: '+365 days' },
  { id: 'lifetime', label: 'Lifetime', days: 'No Expiry' },
]

export default function PlanEditModal({ user, onClose, onSuccess }) {
  const currentPlan = user?.plan || 'basic'
  const [selectedPlan, setSelectedPlan] = useState(currentPlan)
  const [duration, setDuration] = useState('1m')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState(false)

  const isExpired = user?.planStatus === 'expired'
  const expiresAt = user?.planExpiresAt

  async function handleAssignPlan() {
    setSaving(true)
    try {
      const res = await apiClient(`/api/admin/users/${user.uid}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan: selectedPlan,
          duration: selectedPlan === 'basic' ? undefined : duration,
          notes: notes.trim() || undefined,
        }),
      })
      toast.success(res.message || `Assigned ${selectedPlan.toUpperCase()} tier`)
      onSuccess?.(res.membership)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to update user membership plan')
    } finally {
      setSaving(false)
    }
  }

  async function handleRevokePlan() {
    if (!window.confirm(`Revoke ${user.displayName || user.email}'s plan back to Basic? Saved data will be preserved, but new additions will be capped at Basic limits.`)) {
      return
    }

    setRevoking(true)
    try {
      const res = await apiClient(`/api/admin/users/${user.uid}/plan/revoke`, {
        method: 'PATCH',
        body: JSON.stringify({
          reason: notes.trim() || 'Admin manual revocation',
        }),
      })
      toast.success('Membership revoked back to Basic plan')
      onSuccess?.({ plan: 'basic', planStatus: 'revoked' })
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to revoke plan')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="glass-panel w-full max-w-lg p-6 rounded-3xl relative max-h-[92vh] overflow-y-auto scrollbar-hide shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-border mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-primary/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-textPrimary font-display">Manage Membership Tier</h2>
                <p className="text-xs text-textMuted mt-0.5 truncate max-w-[280px]">
                  {user.displayName || user.email} · Current: <span className="font-bold uppercase text-textPrimary">{currentPlan}</span>
                  {expiresAt && ` · Exp: ${new Date(expiresAt).toLocaleDateString('en-IN')}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-slate-100 dark:hover:bg-white/5 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Status Pill */}
          <div className="mb-5 p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-border flex items-center justify-between text-xs">
            <div>
              <span className="text-textMuted">Status: </span>
              <span className={clsx(
                "font-bold uppercase px-2 py-0.5 rounded",
                isExpired ? "bg-danger/15 text-danger" : "bg-success/15 text-success"
              )}>
                {user.planStatus || 'ACTIVE'}
              </span>
            </div>
            {user.dailyAiUsage && (
              <span className="text-textMuted font-mono">
                Today AI: <strong className="text-textPrimary">{user.dailyAiUsage.count || 0}</strong> uses
              </span>
            )}
          </div>

          {/* Plan Selection Cards */}
          <div className="space-y-3 mb-5">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">
              Select Membership Tier
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {PLANS.map(p => {
                const isSelected = selectedPlan === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p.id)}
                    className={clsx(
                      "p-3 rounded-2xl border text-left transition-all duration-200 relative flex flex-col justify-between",
                      isSelected
                        ? p.id === 'premium'
                          ? "bg-amber-50 dark:bg-amber-500/15 border-amber-400 dark:border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-400 dark:ring-amber-500/40"
                          : p.id === 'pro'
                          ? "bg-primary/10 dark:bg-primary/15 border-primary/40 dark:border-primary/60 shadow-[0_0_15px_rgba(99,102,241,0.15)] ring-1 ring-primary/40"
                          : "bg-slate-100 dark:bg-surfaceHover border-slate-300 dark:border-border/90"
                        : "bg-slate-50 dark:bg-surface border-slate-200 dark:border-border hover:border-slate-300 dark:hover:border-border/80"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-extrabold text-textPrimary">{p.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </div>
                      <p className="text-sm font-bold text-textPrimary">{p.price}</p>
                    </div>
                    <ul className="mt-2 space-y-1 text-[10px] text-textMuted">
                      {p.features.slice(0, 2).map((f, i) => (
                        <li key={i} className="truncate">• {f}</li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Duration Selector (Only if Pro or Premium) */}
          {selectedPlan !== 'basic' && (
            <div className="space-y-2 mb-5">
              <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">
                Validity Period
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDuration(d.id)}
                    className={clsx(
                      "px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all text-center",
                      duration === d.id
                        ? "bg-primary/15 dark:bg-primary/20 border-primary text-primary"
                        : "bg-slate-50 dark:bg-surface border-slate-200 dark:border-border text-slate-700 dark:text-textMuted hover:text-textPrimary hover:border-slate-300 dark:hover:border-border/80"
                    )}
                  >
                    <div>{d.label}</div>
                    <div className="text-[9px] opacity-70 mt-0.5">{d.days}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Admin Notes */}
          <div className="space-y-2 mb-6">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">
              Internal Admin Notes / Payment Reference
            </label>
            <input
              type="text"
              placeholder="e.g., Paid via UPI ref 987654321 / Special partner access"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/90 dark:bg-background border border-slate-200 dark:border-border text-xs text-textPrimary placeholder:text-textMuted/60 focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200 dark:border-border">
            {currentPlan !== 'basic' && (
              <button
                type="button"
                onClick={handleRevokePlan}
                disabled={revoking || saving}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-danger hover:bg-danger/10 border border-danger/30 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                <span>Revoke to Basic</span>
              </button>
            )}

            <div className="flex-1 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-border text-slate-700 dark:text-textMuted hover:text-textPrimary hover:bg-slate-100 dark:hover:bg-surfaceHover transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignPlan}
                disabled={saving || revoking}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primaryHover text-white transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
                <span>{selectedPlan === 'basic' ? 'Set as Basic' : 'Allot Membership'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
