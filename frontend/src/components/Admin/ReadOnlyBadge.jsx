import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert } from 'lucide-react'

/**
 * ReadOnlyBadge
 * Displayed in the Admin page header when user has read-only entitlement (no write).
 */
export default function ReadOnlyBadge({ canWrite }) {
  if (canWrite) return null
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border bg-amber-500/10 text-amber-400 border-amber-500/30"
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        Read-Only Access
      </motion.div>
    </AnimatePresence>
  )
}
