import React, { useState } from 'react'
import { 
  ShieldAlert, 
  LogOut, 
  RefreshCw, 
  Mail, 
  AlertTriangle,
  HelpCircle,
  ArrowRight
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function AccessRejectedPage({ reason }) {
  const { currentUser, logout, refreshAdminProfile, rejectedReason } = useAuth()
  const [checking, setChecking] = useState(false)

  const displayReason = reason || rejectedReason || 'Your account access request has been declined by the system administrator.'

  async function handleCheckStatus() {
    setChecking(true)
    try {
      await refreshAdminProfile()
      toast('Status checked. If an administrator re-authorizes your account, access will unlock automatically.', {
        icon: 'ℹ️'
      })
    } catch {
      toast.error('Unable to refresh status')
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
      {/* Red ambient background glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] bg-danger/15 rounded-full blur-[140px] mix-blend-screen opacity-60 dark:opacity-40" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] bg-rose-500/10 rounded-full blur-[140px] mix-blend-screen opacity-60 dark:opacity-40" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center bg-white dark:bg-[#0F172A] shadow-premium">
            <div className="absolute inset-0 rounded-2xl bg-danger/30 blur-lg -z-10" />
            <img src="/logo2.png" alt="Logo" className="w-8 h-8 object-contain brand-logo" />
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold font-display text-textPrimary tracking-tight leading-none">Tatvarth</h1>
            <p className="text-xs font-semibold text-danger tracking-wide leading-none mt-1">StockWatch</p>
          </div>
        </div>

        {/* Main Rejected Glass Card */}
        <div className="glass-panel border border-danger/30 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Top Status Pill */}
          <div className="flex items-center justify-between pb-6 border-b border-border/60">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-danger/10 border border-danger/25 text-danger text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-danger inline-block" />
              <span>Access Request Declined</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-medium text-textMuted bg-surface px-2.5 py-1 rounded-full border border-border">
              <span>Restricted Mode</span>
            </div>
          </div>

          {/* Icon & Title */}
          <div className="my-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute -inset-4 rounded-full bg-danger/20 blur-xl" />
              <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-danger/20 to-rose-500/20 border border-danger/30 flex items-center justify-center shadow-inner">
                <ShieldAlert className="w-10 h-10 text-danger" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold font-display tracking-tight text-textPrimary">
              Access Not Granted
            </h2>
            <p className="text-sm text-textMuted max-w-sm mt-2 leading-relaxed">
              The administrator has rejected your request to access the StockWatch application.
            </p>
          </div>

          {/* Reason Box */}
          <div className="p-4 rounded-2xl bg-danger/5 border border-danger/20 mb-6 space-y-1.5">
            <div className="flex items-center gap-2 text-danger text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Reason provided by administrator</span>
            </div>
            <p className="text-xs sm:text-sm text-textPrimary font-medium pl-6 leading-relaxed">
              "{displayReason}"
            </p>
          </div>

          {/* User Account Info */}
          <div className="p-3.5 rounded-2xl bg-surface/60 border border-border/70 mb-6 flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-textPrimary">{displayName}</p>
              <p className="text-textMuted">{email}</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-danger/10 text-danger border border-danger/20">
              REJECTED
            </span>
          </div>

          {/* What can you do? */}
          <div className="space-y-3 mb-6 text-xs text-textMuted">
            <p className="font-semibold text-textPrimary flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-primary" />
              What can you do?
            </p>
            <p className="leading-relaxed">
              If this was done in error or you have updated organizational credentials, contact the administrator. If the admin re-allows your account, this screen will instantly unlock your access.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCheckStatus}
                disabled={checking}
                className="py-3 px-4 rounded-xl border border-border bg-surface hover:bg-surfaceHover text-textPrimary font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin text-primary' : ''}`} />
                <span>{checking ? 'Checking...' : 'Check Status'}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="py-3 px-4 rounded-xl border border-border bg-background hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-textMuted font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>

            <a
              href={`mailto:support@stockwatch.app?subject=Account%20Access%20Appeal%20-%20${encodeURIComponent(email)}&body=Hello%20Admin,%0A%0AMy%20account%20(${encodeURIComponent(email)})%20was%20declined%20access.%20Please%20review%20my%20request.`}
              className="w-full py-2.5 text-xs text-center text-primary hover:text-primary/80 transition flex items-center justify-center gap-1.5 font-medium"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Contact Administrator Support</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-textMuted/70 mt-6">
          Tatvarth StockWatch • Real-time Corporate Intelligence & BSE/NSE Filings
        </p>
      </div>
    </div>
  )
}
