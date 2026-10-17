import React, { useState } from 'react'
import { 
  ShieldAlert, 
  LogOut, 
  RefreshCw, 
  Mail, 
  AlertOctagon,
  Lock,
  ArrowRight,
  ShieldOff
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function AccountDisabledPage({ reason }) {
  const { currentUser, logout, refreshAdminProfile, disabledReason } = useAuth()
  const [checking, setChecking] = useState(false)

  const displayReason = reason || disabledReason || 'Your account access has been suspended by an administrator.'

  async function handleCheckStatus() {
    setChecking(true)
    try {
      await refreshAdminProfile()
      toast('Status verified. When an administrator re-enables your account, your access will be restored automatically.', {
        icon: 'ℹ️'
      })
    } catch {
      toast.error('Unable to refresh account status')
    } finally {
      setTimeout(() => setChecking(false), 500)
    }
  }

  async function handleSignOut() {
    try {
      await logout()
      toast.success('Signed out successfully')
    } catch (err) {
      toast.error('Failed to sign out: ' + err.message)
    }
  }

  const displayName = currentUser?.displayName || 'User'
  const email = currentUser?.email || ''

  return (
    <div className="min-h-[100dvh] relative overflow-hidden bg-background auth-grid-bg flex flex-col items-center justify-center p-4 sm:p-6 text-textPrimary">
      {/* Red/crimson ambient background glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] bg-danger/20 rounded-full blur-[140px] mix-blend-screen opacity-70 dark:opacity-40" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] bg-rose-600/15 rounded-full blur-[140px] mix-blend-screen opacity-70 dark:opacity-40" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center bg-white dark:bg-[#0F172A] shadow-premium">
            <div className="absolute inset-0 rounded-2xl bg-danger/30 blur-lg -z-10" />
            <img src="/logo2.png" alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold font-display text-textPrimary tracking-tight leading-none">Tatvarth</h1>
            <p className="text-xs font-semibold text-danger tracking-wide leading-none mt-1">StockWatch</p>
          </div>
        </div>

        {/* Main Disabled Glass Card */}
        <div className="glass-panel border border-danger/30 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Top Status Pill */}
          <div className="flex items-center justify-between pb-6 border-b border-border/60">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-danger/10 border border-danger/25 text-danger text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-danger inline-block animate-pulse" />
              <span>Account Access Suspended</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-medium text-danger/80 bg-danger/5 px-2.5 py-1 rounded-full border border-danger/20">
              <Lock className="w-3 h-3 text-danger" />
              <span>Sessions Revoked</span>
            </div>
          </div>

          {/* Icon & Title */}
          <div className="my-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute -inset-4 rounded-full bg-danger/25 blur-xl" />
              <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-danger/20 via-danger/10 to-rose-600/20 border border-danger/30 flex items-center justify-center shadow-inner">
                <ShieldOff className="w-10 h-10 text-danger" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold font-display tracking-tight text-textPrimary">
              Account Disabled
            </h2>
            <p className="text-sm text-textMuted max-w-sm mt-2 leading-relaxed">
              An administrator has suspended access for this account. All active sessions and background permissions have been revoked.
            </p>
          </div>

          {/* Reason Box */}
          <div className="p-4 rounded-2xl bg-danger/5 border border-danger/20 mb-6 space-y-1.5">
            <div className="flex items-center gap-2 text-danger text-xs font-semibold">
              <AlertOctagon className="w-4 h-4 shrink-0" />
              <span>Suspension Reason</span>
            </div>
            <p className="text-xs text-textSecondary leading-relaxed pl-6 font-mono">
              "{displayReason}"
            </p>
          </div>

          {/* User Details Pill */}
          <div className="p-3.5 rounded-2xl bg-surface/50 border border-border/70 mb-6 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-7 h-7 rounded-full bg-danger/10 text-danger flex items-center justify-center font-bold text-xs shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="truncate text-left">
                <p className="font-semibold text-textPrimary truncate">{displayName}</p>
                <p className="text-textMuted truncate text-[11px]">{email}</p>
              </div>
            </div>
            <span className="shrink-0 text-[10px] uppercase font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full">
              Disabled
            </span>
          </div>

          {/* Real-time status sync info banner */}
          <div className="p-3.5 rounded-2xl bg-surface/40 border border-border/60 mb-6 text-xs text-textMuted flex items-start gap-2.5">
            <RefreshCw className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-textPrimary">Live Synchronization:</strong> When an administrator restores your account in the control center, your application access will automatically unlock in real-time.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold bg-surface border border-border hover:border-danger/30 text-textPrimary hover:bg-surface/80 transition-all shadow-sm active:scale-[0.99] disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin text-danger' : 'text-textMuted'}`} />
              <span>{checking ? 'Checking Status…' : 'Check Status Now'}</span>
            </button>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold bg-danger hover:bg-danger/90 text-white transition-all shadow-md active:scale-[0.99]"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign In With Different Account</span>
            </button>
          </div>

          {/* Support / Help */}
          <div className="mt-6 pt-5 border-t border-border/60 text-center">
            <p className="text-xs text-textMuted flex items-center justify-center gap-1.5">
              <span>Need help or want to appeal?</span>
              <a 
                href="mailto:support@tatvarth.com?subject=StockWatch%20Account%20Suspension%20Appeal"
                className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
              >
                <Mail className="w-3 h-3 inline" />
                Contact Administrator
              </a>
            </p>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-textMuted/60 mt-6">
          Tatvarth StockWatch Security &bull; Multi-Device Access Revocation
        </p>
      </div>
    </div>
  )
}
