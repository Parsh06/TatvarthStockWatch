import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, Loader2 } from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'

/**
 * DisableUserModal
 *
 * Confirmation modal for disabling a user account.
 *
 * Props:
 *   user      — the user object { uid, email, displayName }
 *   onClose   — called when modal should close
 *   onSuccess — called after successful disable
 */
export default function DisableUserModal({ user, onClose, onSuccess }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleDisable = useCallback(async () => {
    setSaving(true)
    try {
      await apiClient(`/api/admin/users/${user.uid}/disable`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      })
      toast.success('Account disabled and all sessions revoked')
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to disable account')
    } finally {
      setSaving(false)
    }
  }, [user.uid, reason, onSuccess, onClose])

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="glass-panel w-full max-w-md p-6 rounded-2xl relative"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-danger/15 border border-danger/25 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-danger" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-textPrimary font-display">Disable Account</h2>
              <p className="text-sm text-textMuted mt-1">
                This will immediately sign out <span className="text-textPrimary font-semibold">{user.displayName || user.email}</span> from all devices and block any new sign-ins.
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-slate-100 dark:hover:bg-white/5 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Reason (shown to user)</label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {[
                'Terms of service violation',
                'Suspicious activity or unauthorized access',
                'Administrative hold pending review',
                'Automated request abuse'
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-surface border border-slate-200 dark:border-border/80 text-slate-700 dark:text-textMuted hover:text-textPrimary hover:border-danger/30 transition"
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Specify the reason why access is being revoked (this will be displayed to the user)…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-slate-100/90 dark:bg-surface border border-slate-200 dark:border-border text-sm text-textPrimary placeholder:text-textMuted/70 focus:outline-none focus:border-danger/40 resize-none transition"
            />
          </div>

          <p className="text-xs text-danger dark:text-danger/90 bg-rose-50 dark:bg-danger/10 border border-rose-200 dark:border-danger/20 rounded-xl px-3 py-2.5 mb-5 leading-relaxed">
            ⚠️ <strong>Instant Revocation:</strong> All active browser sessions and background listeners for this user will be terminated immediately. Push notification subscriptions will also be removed.
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-border text-slate-700 dark:text-textMuted hover:text-textPrimary hover:bg-slate-100 dark:hover:bg-surfaceHover transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDisable}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-danger hover:bg-danger/80 text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Disabling…' : 'Disable Account'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
