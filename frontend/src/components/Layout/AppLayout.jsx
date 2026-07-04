import { useState, useEffect, useRef } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Star, Bell, Settings, TrendingUp, Briefcase,
  BarChart2, Search, CalendarDays, Globe, Newspaper, Layers, BellRing, Eye,
  LogOut, Crown, Presentation
} from 'lucide-react'
import GlobalSearch from '../Common/GlobalSearch'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const mobileNav = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/watchlist',         icon: Star,            label: 'Watchlist' },
  { to: '/portfolio',         icon: Briefcase,       label: 'Portfolio' },
  { to: '/announcements',     icon: Bell,            label: 'My News'   },
  { to: '/all-announcements', icon: Globe,           label: 'All News'  },
  { to: '/board-meetings',    icon: Presentation,    label: 'Meetings'  },
  { to: '/calendar',          icon: CalendarDays,    label: 'Calendar'  },
  { to: '/company-data',      icon: BarChart2,       label: 'Company'   },
  { to: '/news',              icon: Newspaper,       label: 'Market'    },
  { to: '/bulk-block',        icon: Layers,          label: 'Deals'     },
  { to: '/insider',           icon: Eye,             label: 'Insider'   },
  { to: '/alerts',            icon: BellRing,        label: 'Alerts'    },
  { to: '/premium',           icon: Crown,           label: 'Premium'   },
  { to: '/settings',          icon: Settings,        label: 'Settings'  },
]

export default function AppLayout({ children }) {
  const { logout } = useAuth()
  const [collapsed, setCollapsed]   = useState(false)
  const [isMd, setIsMd]             = useState(() => window.innerWidth >= 768)
  const [searchOpen, setSearchOpen] = useState(false)
  const sidebarWidth = collapsed ? 64 : 240
  const navRef = useRef(null)
  const location = useLocation()

  useEffect(() => {
    function onResize() { setIsMd(window.innerWidth >= 768) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Ctrl+K / Cmd+K global search
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Scroll active nav item into view on route change
  useEffect(() => {
    if (!navRef.current) return
    const active = navRef.current.querySelector('[data-active="true"]')
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [location.pathname])

  async function handleLogout() {
    try {
      await logout()
      toast.success('Signed out')
    } catch {
      toast.error('Failed to sign out')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Sidebar — desktop only */}
      {isMd && <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />}

      {/* Topbar — desktop only */}
      {isMd && <Topbar sidebarWidth={sidebarWidth} onSearch={() => setSearchOpen(true)} />}

      {/* Mobile topbar */}
      {!isMd && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-surface/80 backdrop-blur-md border-b border-border flex items-center justify-center px-4 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#0F172A]">
              <img src="/logo2.png" alt="Logo" className="w-6 h-6 object-contain" />
            </div>
            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">TatvarthStockWatch</span>
          </div>
        </div>
      )}

      {/* Main content */}
      <main
        className="transition-all duration-300 pt-16 pb-24 md:pb-0"
        style={{ paddingLeft: isMd ? sidebarWidth : 0 }}
      >
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          {children}
        </div>
        <footer className="border-t border-border/40 px-6 py-4 mt-2">
          <p className="text-[11px] text-textMuted/40 text-center leading-relaxed max-w-3xl mx-auto">
            TatvarthTatvarthStockWatch is a proprietary data aggregation tool. Market data is provided
            for informational purposes only. This is <strong>not</strong> investment advice. Past performance is not
            indicative of future results. TatvarthTatvarthStockWatch is an independent platform
            built for sophisticated investors.
          </p>
        </footer>
      </main>

      {/* Mobile bottom nav — horizontally scrollable */}
      {!isMd && (
        <nav className="fixed bottom-0 left-0 right-0 z-20 bg-surface border-t border-border">
          {/* Scroll container */}
          <div
            ref={navRef}
            className="flex overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {mobileNav.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                data-active={location.pathname === to ? 'true' : 'false'}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center justify-center gap-0.5 py-2.5 px-3.5 text-[11px] font-medium transition-colors flex-shrink-0 relative',
                    isActive
                      ? 'text-primary'
                      : 'text-textMuted'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active indicator bar at top */}
                    {isActive && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                    )}
                    <Icon className={clsx('w-5 h-5', isActive ? 'text-primary' : 'text-textMuted/70')} />
                    <span className={clsx(isActive ? 'text-primary' : 'text-textMuted/70')}>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
