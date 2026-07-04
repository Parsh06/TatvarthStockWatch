import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Star, Bell, BellRing, Settings, TrendingUp, ChevronLeft, ChevronRight, LogOut, Crown, Layers, BarChart2, Globe, Newspaper, Briefcase, CalendarDays, Eye, Presentation } from 'lucide-react'
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
  { to: '/gainers-losers',     icon: TrendingUp,      label: 'Top Gainers/Losers' },
  { to: '/news',               icon: Newspaper,       label: 'Market News' },
  { to: '/bulk-block',         icon: Layers,          label: 'Bulk & Block Deals' },
  { to: '/company-data',       icon: BarChart2,       label: 'Company Data' },
  { to: '/calendar',           icon: CalendarDays,    label: 'Corp. Calendar' },
  { to: '/insider',            icon: Eye,             label: 'Insider Trading' },
  { to: '/alerts',             icon: BellRing,        label: 'Alert History' },
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
        'fixed top-0 left-0 h-screen bg-surface border-r border-border flex flex-col transition-all duration-300 z-30',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={clsx('flex items-center h-16 border-b border-border px-4', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#0F172A]">
          <img src="/logo2.png" alt="Logo" className="w-6 h-6 object-contain" />
        </div>
        {!collapsed && <span className="font-bold text-textPrimary text-lg">TatvarthStockWatch</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto flex flex-col gap-0.5">
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
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-textMuted hover:bg-[#0F172A]/5 hover:text-textPrimary',
                collapsed && 'justify-center'
              )
            }
          >
            <div className="relative flex-shrink-0">
              <Icon className="w-5 h-5" />
              {to === '/announcements' && annCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full text-[10px] font-bold flex items-center justify-center bg-amber-500 text-white leading-none">
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
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                to === '/premium' && !isPremium && !isActive
                  ? 'text-amber-400 hover:bg-amber-400/10'
                  : isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-textMuted hover:bg-[#0F172A]/5 hover:text-textPrimary',
                collapsed && 'justify-center'
              )
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <span className="flex-1">{label}</span>
            )}
            {!collapsed && to === '/premium' && isPremium && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-400/15 text-amber-400 rounded font-semibold">PRO</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-border p-3">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-textPrimary truncate">{currentUser?.displayName || 'User'}</p>
              <p className="text-xs text-textMuted truncate">{currentUser?.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-textMuted hover:text-danger hover:bg-danger/10 transition',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-surface border border-border rounded-full flex items-center justify-center text-textMuted hover:text-textPrimary transition shadow-md"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  )
}
