import { useState } from 'react'
import { Check, X, Zap, Star, Bell, Mail, TrendingUp, Infinity as InfinityIcon, Shield, Send, Crown } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import { useTier } from '../../contexts/TierContext'
import toast from 'react-hot-toast'

const FREE_FEATURES = [
  { label: 'Up to 10 scripts in watchlist', included: true },
  { label: 'BSE & NSE announcements', included: true },
  { label: 'Live LTP / OHLC rates', included: true },
  { label: 'Telegram notifications', included: true },
  { label: 'Announcement history', included: true },
  { label: 'Price alerts (above/below)', included: false },
  { label: 'Email notifications', included: false },
  { label: 'Unlimited watchlist scripts', included: false },
  { label: 'Priority support', included: false },
]

const PREMIUM_FEATURES_LIST = [
  { icon: InfinityIcon, label: 'Unlimited watchlist scripts', color: 'text-primary' },
  { icon: Bell,         label: 'Price alerts — above & below thresholds', color: 'text-amber-400' },
  { icon: Mail,         label: 'Email notifications when alerts fire', color: 'text-sky-400' },
  { icon: Send,         label: 'Telegram alerts for announcements & prices', color: 'text-blue-400' },
  { icon: TrendingUp,   label: 'Live rates with progressive background sync', color: 'text-emerald-400' },
  { icon: Star,         label: 'BSE & NSE announcement tracking', color: 'text-violet-400' },
  { icon: Shield,       label: 'Priority support', color: 'text-rose-400' },
]

function FeatureRow({ label, included }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
      <div className={clsx(
        'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center',
        included ? 'bg-emerald-500/15' : 'bg-white/5'
      )}>
        {included
          ? <Check className="w-3 h-3 text-emerald-400" />
          : <X className="w-3 h-3 text-textMuted/40" />
        }
      </div>
      <span className={clsx('text-sm', included ? 'text-textPrimary' : 'text-textMuted/50 line-through')}>{label}</span>
    </div>
  )
}

export default function PremiumPage() {
  const { currentUser, isDemo } = useAuth()
  const { isPremium, tier, upgrade } = useTier()
  const [upgrading, setUpgrading] = useState(false)

  async function handleUpgrade() {
    if (!currentUser || isDemo) {
      toast.error('Sign in with Firebase to upgrade to Premium')
      return
    }
    setUpgrading(true)
    try {
      await upgrade()
      toast.success('🎉 Welcome to Premium! All features unlocked.', { duration: 5000 })
    } catch (e) {
      toast.error(`Upgrade failed: ${e.message}`)
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3 py-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-400/10 border border-amber-400/25 rounded-full text-amber-400 text-xs font-semibold">
          <Crown className="w-3.5 h-3.5" />
          TatvarthStockWatch Premium
        </div>
        <h1 className="text-3xl font-bold text-textPrimary">Unlock the full power of your watchlist</h1>
        <p className="text-textMuted max-w-xl mx-auto">
          Get price alerts, unlimited scripts, and instant notifications so you never miss a move.
        </p>
      </div>

      {/* Current status */}
      {isPremium && (
        <div className="flex items-center gap-3 px-5 py-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl">
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Crown className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-emerald-400">You're on Premium{isDemo ? ' (Demo / Local mode)' : ''}</p>
            <p className="text-sm text-textMuted">All features are unlocked. Enjoy!</p>
          </div>
        </div>
      )}

      {/* Comparison cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Free card */}
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-1">Free Plan</p>
            <p className="text-3xl font-bold text-textPrimary">₹0 <span className="text-base font-normal text-textMuted">/ forever</span></p>
          </div>
          <div className="space-y-0">
            {FREE_FEATURES.map((f) => <FeatureRow key={f.label} {...f} />)}
          </div>
          <div className={clsx(
            'mt-5 w-full py-2.5 rounded-xl text-sm font-semibold text-center border transition',
            !isPremium
              ? 'bg-white/5 border-border text-textMuted cursor-default'
              : 'border-border text-textMuted'
          )}>
            {!isPremium ? '✓ Current plan' : 'Free plan'}
          </div>
        </div>

        {/* Premium card */}
        <div className="relative bg-gradient-to-b from-amber-500/10 to-surface border border-amber-500/30 rounded-2xl p-6">
          <div className="absolute top-4 right-4">
            <span className="px-2.5 py-1 bg-amber-400/20 text-amber-400 text-xs font-bold rounded-full border border-amber-400/30">BEST VALUE</span>
          </div>
          <div className="mb-5">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Premium Plan</p>
            <p className="text-3xl font-bold text-textPrimary">₹299 <span className="text-base font-normal text-textMuted">/ month</span></p>
            <p className="text-xs text-textMuted mt-1">or contact your admin to enable</p>
          </div>
          <div className="space-y-3 mb-6">
            {PREMIUM_FEATURES_LIST.map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                  <Icon className={clsx('w-3.5 h-3.5', color)} />
                </div>
                <span className="text-sm text-textPrimary">{label}</span>
              </div>
            ))}
          </div>
          {isPremium ? (
            <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              ✓ Active
            </div>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-60 text-white font-semibold rounded-xl transition shadow-lg shadow-amber-500/20"
            >
              {upgrading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Zap className="w-4 h-4" />
              }
              {upgrading ? 'Upgrading…' : 'Upgrade to Premium'}
            </button>
          )}
        </div>
      </div>

      {/* Feature breakdown */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <h2 className="font-semibold text-textPrimary mb-5">What you get with Premium</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: Bell,         title: 'Price Alerts',           desc: 'Set above/below price thresholds per script. Get notified the moment a stock crosses your target.',    color: 'text-amber-400', bg: 'bg-amber-400/10' },
            { icon: InfinityIcon, title: 'Unlimited Watchlist',    desc: 'Track every stock you care about. No 10-script cap, no restrictions.',                                  color: 'text-primary',   bg: 'bg-primary/10'   },
            { icon: Mail,         title: 'Email Notifications',    desc: 'Receive a formatted email digest for announcements and price alerts directly to your inbox.',           color: 'text-sky-400',   bg: 'bg-sky-400/10'   },
            { icon: Send,         title: 'Telegram Alerts',        desc: 'Instant Telegram messages when your watchlist scripts make announcements or hit price targets.',        color: 'text-blue-400',  bg: 'bg-blue-400/10'  },
          ].map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="flex gap-3 p-4 bg-background rounded-xl border border-border/50">
              <div className={clsx('flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center', bg)}>
                <Icon className={clsx('w-4.5 h-4.5', color)} />
              </div>
              <div>
                <p className="font-medium text-textPrimary text-sm mb-0.5">{title}</p>
                <p className="text-xs text-textMuted leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Local / demo notice */}
      {isDemo && (
        <div className="flex items-start gap-3 px-4 py-3 bg-sky-500/10 border border-sky-500/25 rounded-xl text-sm text-sky-400">
          <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>You're running in <strong>local / demo mode</strong> — all Premium features are already unlocked. Add Firebase credentials to your <code>.env</code> file to enable real user accounts and tier management.</p>
        </div>
      )}
    </div>
  )
}
