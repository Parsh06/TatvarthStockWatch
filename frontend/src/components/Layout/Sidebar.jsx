import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Star, Bell, BellRing, Settings, TrendingUp, ChevronLeft, ChevronRight, LogOut, Crown, Layers, BarChart2, Globe, Newspaper, Briefcase, CalendarDays, Eye, Presentation, Zap, Users } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import { useTier } from '../../contexts/TierContext'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'

const NAV_TOP = [
  { to: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/watchlist',          icon: Star,            label: 'Watchlist' },
  { to: '/portfolio',          icon: Briefcase,       label: 'Portfolio' },
  { to: '/announcements',      icon: Bell,            label: 'My Announcements' },
  { to: '/all-announcements',  icon: Globe,           label: 'All Announcements' },
  { to: '/board-meetings',     icon: Presentation,    label: 'Board Meeting Updates' },
  { to: '/agm-updates',        icon: Users,           label: 'AGM Updates' },
  { to: '/gainers-losers',     icon: TrendingUp,      label: 'Top Gainers/Losers' },
  { to: '/volume-spurt',       icon: Zap,             label: 'Live Volume Spurt' },
  { to: '/news',               icon: Newspaper,       label: 'Market News' },
  { to: '/bulk-block',         icon: Layers,          label: 'Bulk & Block Deals' },
  { to: '/company-data',       icon: BarChart2,       label: 'Company Data' },
  { to: '/calendar',           icon: CalendarDays,    label: 'Corp. Calendar' },
  { to: '/insider',            icon: Eye,             label: 'Insider Trading' },
]
const NAV_BOTTOM = [
  { to: '/premium',  icon: Crown,    label: 'Premium' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

const LS_KEY = 'ann_last_seen'

function getLastSeen() { return localStorage.getItem(LS_KEY) || '' }
function markSeen()    { localStorage.setItem(LS_KEY, new Date().toISOString()) }

export default function Sidebar({ collapsed, onToggle }) {
  const { currentUser, logout } = useAuth()
  const { isPremium } = useTier()
  const [annCount, setAnnCount] = useState(0)

  // Fetch count of announcements newer than last-seen timestamp
  function refreshBadge() {
    if (!currentUser) return
    const since = getLastSeen()
    const qs = since ? `?since=${encodeURIComponent(since)}` : ''
    apiClient(`/api/announcements${qs}`)
      .then((d) => setAnnCount(d?.total || 0))
      .catch(() => {})
  }

  useEffect(() => { refreshBadge() }, [currentUser])

  // Re-check badge whenever announcements are fetched from the Watchlist page
  useEffect(() => {
    const handler = () => refreshBadge()
    window.addEventListener('announcements-fetched', handler)
    return () => window.removeEventListener('announcements-fetched', handler)
  }, [currentUser])

  async function handleLogout() {
    try {
      await logout()
      toast.success('Signed out')
    } catch {
      toast.error('Failed to sign out')
    }
  }

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser?.email?.[0]?.toUpperCase() || 'U'

  return (
    <aside
      className={clsx(
        'fixed top-4 left-4 h-[calc(100vh-32px)] glass-panel rounded-2xl flex flex-col transition-all duration-300 z-30',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={clsx('flex items-center h-[72px] border-b border-white/5 px-4', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 shadow-inner border border-white/5">
          <img src="/logo2.png" alt="Logo" className="w-6 h-6 object-contain" />
        </div>
        {!collapsed && <span className="font-bold text-textPrimary text-lg tracking-tight">Tatvarth</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-6 px-3 overflow-y-auto flex flex-col gap-1 scrollbar-hide">
        {NAV_TOP.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => {
              if (to === '/announcements') {
                markSeen()
                setAnnCount(0)
              }
            }}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary/20 text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
                  : 'text-textMuted hover:bg-white/5 hover:text-textPrimary hover:-translate-y-[1px]',
                collapsed && 'justify-center'
              )
            }
            title={collapsed ? label : undefined}
          >
            <div className="relative flex-shrink-0">
              <Icon className={clsx("w-[22px] h-[22px] transition-transform group-hover:scale-110", collapsed ? "" : "")} />
              {to === '/announcements' && annCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-danger text-white leading-none shadow-[0_0_10px_rgba(244,63,94,0.5)]">
                  {annCount > 99 ? '99+' : annCount}
                </span>
              )}
            </div>
            {!collapsed && <span className="flex-1">{label}</span>}
          </NavLink>
        ))}

        <div className="flex-1" />

        {/* Premium + Settings at bottom of nav */}
        {NAV_BOTTOM.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                to === '/premium' && !isPremium && !isActive
                  ? 'text-amber-400 hover:bg-amber-400/10 hover:-translate-y-[1px]'
                  : isActive
                    ? 'bg-primary/20 text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
                    : 'text-textMuted hover:bg-white/5 hover:text-textPrimary hover:-translate-y-[1px]',
                collapsed && 'justify-center'
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="w-[22px] h-[22px] flex-shrink-0 transition-transform group-hover:scale-110" />
            {!collapsed && (
              <span className="flex-1">{label}</span>
            )}
            {!collapsed && to === '/premium' && isPremium && (
              <span className="text-[10px] px-2 py-0.5 bg-gradient-to-r from-amber-400/20 to-amber-500/20 text-amber-400 rounded-md font-bold border border-amber-400/20 shadow-[0_0_8px_rgba(251,191,36,0.2)]">PRO</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-white/5 p-4">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2 mb-3 bg-white/5 rounded-xl border border-white/5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-lg">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-textPrimary truncate">{currentUser?.displayName || 'User'}</p>
              <p className="text-[11px] text-textMuted truncate">{currentUser?.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-textMuted hover:text-danger hover:bg-danger/10 transition-all duration-200 group',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="w-[22px] h-[22px] flex-shrink-0 group-hover:scale-110 transition-transform" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-surface border border-white/10 rounded-full flex items-center justify-center text-textMuted hover:text-textPrimary hover:bg-white/10 transition-all shadow-lg z-40"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}
