import { motion } from 'framer-motion'
import clsx from 'clsx'

/**
 * AdminStatCard
 * Reusable stat card for the Admin Analytics tab using the glass-panel design system.
 */
export default function AdminStatCard({ label, value, sub, icon: Icon, color = 'text-primary', trend, loading = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="glass-panel glass-panel--interactive p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-textMuted uppercase tracking-widest">{label}</span>
        {Icon && (
          <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center bg-current/10', color)}>
            <Icon className={clsx('w-4.5 h-4.5', color)} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="skeleton h-8 w-24 rounded-lg" />
      ) : (
        <span className={clsx('text-3xl font-bold font-display text-textPrimary', color)}>
          {value ?? '—'}
        </span>
      )}

      {sub && (
        <span className="text-xs text-textMuted">{sub}</span>
      )}

      {trend !== undefined && !loading && (
        <div className={clsx(
          'inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full w-fit',
          trend > 0 ? 'bg-success/10 text-success' : trend < 0 ? 'bg-danger/10 text-danger' : 'bg-surface text-textMuted'
        )}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '—'} {Math.abs(trend)}%
        </div>
      )}
    </motion.div>
  )
}
