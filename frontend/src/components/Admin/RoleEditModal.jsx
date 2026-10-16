import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShieldCheck, ShieldX, Loader2 } from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'

/**
 * RoleEditModal
 *
 * Modal for admins (with write entitlement) to change a user's role and entitlements.
 *
 * Props:
 *   user      — the user object being edited { uid, email, displayName, role, entitlements }
 *   onClose   — called when modal should close
 *   onSuccess — called after successful role change (receives updated role + entitlements)
 */
export default function RoleEditModal({ user, onClose, onSuccess }) {
  const [selectedRole, setSelectedRole] = useState(user.role || 'user')
  const [readEntitlement, setReadEntitlement] = useState(user.entitlements?.read ?? false)
  const [writeEntitlement, setWriteEntitlement] = useState(user.entitlements?.write ?? false)
  const [saving, setSaving] = useState(false)

  // Write implies read
  const handleWriteChange = (val) => {
    setWriteEntitlement(val)
    if (val) setReadEntitlement(true)
  }
  const handleReadChange = (val) => {
    setReadEntitlement(val)
    if (!val) setWriteEntitlement(false)
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await apiClient(`/api/admin/users/${user.uid}/role`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: selectedRole,
          entitlements: { read: readEntitlement, write: writeEntitlement },
        }),
      })
      toast.success(`Role updated to '${selectedRole}'`)
      onSuccess?.({ role: selectedRole, entitlements: { read: readEntitlement, write: writeEntitlement } })
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to update role')
    } finally {
      setSaving(false)
    }
  }, [user.uid, selectedRole, readEntitlement, writeEntitlement, onSuccess, onClose])

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
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-textPrimary font-display">Edit Role & Entitlements</h2>
              <p className="text-sm text-textMuted mt-0.5 truncate max-w-[260px]">
                {user.displayName || user.email}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-white/5 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Role Selection */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-3">Role</label>
            <div className="grid grid-cols-2 gap-3">
              {['user', 'admin'].map(r => (
                <button
                  key={r}
                  onClick={() => {
                    setSelectedRole(r)
                    if (r === 'user') {
                      setReadEntitlement(false)
                      setWriteEntitlement(false)
                    }
                  }}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                    selectedRole === r
                      ? r === 'admin'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                        : 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-surface border-border text-textMuted hover:text-textPrimary hover:border-border/80'
                  }`}
                >
                  {r === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Entitlements (only for admin) */}
          {selectedRole === 'admin' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-3">Entitlements</label>
              <div className="space-y-3">
                {[
                  { key: 'read', label: 'Read Access', desc: 'Can view all admin data', val: readEntitlement, onChange: handleReadChange },
                  { key: 'write', label: 'Write Access', desc: 'Can modify users, roles, and data', val: writeEntitlement, onChange: handleWriteChange },
                ].map(({ key, label, desc, val, onChange }) => (
                  <label key={key} className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border cursor-pointer hover:border-border/80 transition">
                    <div>
                      <p className="text-sm font-semibold text-textPrimary">{label}</p>
                      <p className="text-xs text-textMuted mt-0.5">{desc}</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={val}
                      onClick={() => onChange(!val)}
                      className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                        val ? 'bg-amber-500' : 'bg-border'
                      }`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                        val ? 'left-6' : 'left-1'
                      }`} />
                    </button>
                  </label>
                ))}
              </div>
            </motion.div>
          )}

          {/* Warning */}
          {selectedRole === 'admin' && writeEntitlement && (
            <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-5">
              ⚠️ Write access grants full control over all users and their data. Grant carefully.
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-textMuted hover:text-textPrimary hover:border-border/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
