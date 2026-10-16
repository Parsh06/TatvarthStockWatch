import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShieldAlert, Loader2 } from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'

/**
 * RejectUserModal
 *
 * Modal for declining / rejecting user access to the platform.
 *
 * Props:
 *   user      — the user object { uid, email, displayName }
 *   onClose   — called when modal should close
 *   onSuccess — called after successful rejection
 */
export default function RejectUserModal({ user, onClose, onSuccess }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleReject = useCallback(async () => {
    setSaving(true)
    try {
      await apiClient(`/api/admin/users/${user.uid}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: reason.trim() || 'Access request declined by administrator' }),
      })
      toast.success(`Access rejected for ${user.displayName || user.email}`)
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to reject access')
    } finally {
      setSaving(false)
    }
  }, [user.uid, user.displayName, user.email, reason, onSuccess, onClose])

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
              <ShieldAlert className="w-6 h-6 text-danger" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-textPrimary font-display">Reject User Access</h2>
              <p className="text-sm text-textMuted mt-1">
                Decline access for <span className="text-textPrimary font-semibold">{user.displayName || user.email}</span>. The user will be redirected to the access declined screen.
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/5 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Rejection Reason</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Account not authorized for this environment, unauthorized organization email…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-danger/40 resize-none transition"
            />
            <p className="text-[11px] text-textMuted mt-1.5">
              This reason will be visible to the user on their rejection screen.
            </p>
          </div>

          <p className="text-xs text-danger/80 bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 mb-5">
            ⚠️ Active session tokens will be revoked immediately. You can re-allow and approve this account at any time.
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-textMuted hover:text-textPrimary hover:border-border/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-danger hover:bg-danger/80 text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Rejecting…' : 'Reject Access'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
