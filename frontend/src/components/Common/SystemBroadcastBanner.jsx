import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, AlertTriangle, Info, CheckCircle2, X } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../../services/apiClient'

const SEVERITY_CONFIG = {
  info: {
    bg: 'bg-primary/10 border-primary/30 text-primary',
    icon: Info,
  },
  warning: {
    bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    icon: AlertTriangle,
  },
  urgent: {
    bg: 'bg-danger/10 border-danger/30 text-danger',
    icon: AlertCircle,
  },
  success: {
    bg: 'bg-success/10 border-success/30 text-success',
    icon: CheckCircle2,
  },
}

export default function SystemBroadcastBanner() {
  const [broadcast, setBroadcast] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let mounted = true
    apiClient('/api/health/broadcast')
      .then((res) => {
        if (mounted && res?.broadcast?.active && res?.broadcast?.message) {
          const key = `sw_broadcast_dismissed_${res.broadcast.updatedAt || 'active'}`
          if (sessionStorage.getItem(key)) {
            setDismissed(true)
          }
          setBroadcast(res.broadcast)
        }
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [])

  if (!broadcast || !broadcast.active || dismissed) return null

  const config = SEVERITY_CONFIG[broadcast.severity] || SEVERITY_CONFIG.info
  const Icon = config.icon

  const handleDismiss = () => {
    const key = `sw_broadcast_dismissed_${broadcast.updatedAt || 'active'}`
    sessionStorage.setItem(key, '1')
    setDismissed(true)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full z-30 px-4 py-2"
      >
        <div
          className={clsx(
            'max-w-7xl mx-auto px-4 py-2.5 rounded-2xl border backdrop-blur-xl flex items-center justify-between gap-3 shadow-sm',
            config.bg
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon className="w-4 h-4 flex-shrink-0" />
            <div className="flex items-center gap-2 flex-wrap text-xs font-medium">
              {broadcast.title && (
                <strong className="font-bold uppercase tracking-wider">{broadcast.title}:</strong>
              )}
              <span className="text-textPrimary">{broadcast.message}</span>
            </div>
          </div>

          {broadcast.dismissible !== false && (
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/10 transition flex-shrink-0"
              title="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
