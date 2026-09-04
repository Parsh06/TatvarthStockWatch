import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff, Wifi, AlertTriangle, RefreshCw } from 'lucide-react'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import clsx from 'clsx'

/**
 * OfflineBanner Component
 *
 * Displays a luxury animated status ribbon across the viewport when:
 * 1. User is fully OFFLINE (Rose/Amber pulsing banner)
 * 2. Connection is RESTORED (Emerald success toast for 4 seconds)
 * 3. Network is SEVERELY DEGRADED (Slow connection warning)
 */
export default function OfflineBanner() {
  const { isOnline, isSlow, wasOffline, checking, checkConnection } = useNetworkStatus()

  // Nothing to render if online, not degraded, and not recently restored
  if (isOnline && !wasOffline && !isSlow) {
    return null
  }

  return (
    <AnimatePresence>
      {/* ── 1. FULLY OFFLINE STATE ────────────────────────────────────────── */}
      {!isOnline && (
        <motion.div
          key="offline-banner"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 px-4 py-2.5 bg-gradient-to-r from-red-600/95 via-rose-600/95 to-amber-600/95 backdrop-blur-md text-white shadow-xl border-b border-white/10"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs md:text-sm font-medium">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              <WifiOff className="w-4 h-4 flex-shrink-0 animate-pulse" />
              <span>
                <strong className="font-semibold">You are offline.</strong> Real-time market announcements and notifications are paused.
              </span>
            </div>

            <button
              onClick={() => checkConnection()}
              disabled={checking}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all text-xs font-semibold backdrop-blur-sm border border-white/20 whitespace-nowrap active:scale-95',
                checking && 'opacity-70 cursor-wait'
              )}
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', checking && 'animate-spin')} />
              {checking ? 'Checking...' : 'Retry Now'}
            </button>
          </div>
        </motion.div>
      )}

      {/* ── 2. CONNECTION RESTORED STATE (4-second transient alert) ───────── */}
      {isOnline && wasOffline && (
        <motion.div
          key="restored-banner"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-gradient-to-r from-emerald-600/95 to-teal-600/95 backdrop-blur-md text-white shadow-xl border-b border-white/10"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs md:text-sm font-semibold">
            <Wifi className="w-4 h-4 flex-shrink-0" />
            <span>Connection restored. Syncing live market data & watchlists...</span>
          </div>
        </motion.div>
      )}

      {/* ── 3. NETWORK DEGRADATION WARNING (Slow 2G / high RTT) ───────────── */}
      {isOnline && !wasOffline && isSlow && (
        <motion.div
          key="slow-banner"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-40 px-4 py-1.5 bg-amber-500/90 backdrop-blur-md text-slate-950 shadow-md border-b border-amber-600/30"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-slate-950" />
            <span>Slow network detected. Market data updates may experience slight delay.</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
