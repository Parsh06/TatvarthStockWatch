import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Star, Bell, Settings, TrendingUp, Briefcase,
  BarChart2, Search, CalendarDays, Globe, Newspaper, Layers, BellRing, Eye,
  LogOut, Crown, Presentation, Zap, Users
} from 'lucide-react'
import GlobalSearch from '../Common/GlobalSearch'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Moon, Sun } from 'lucide-react'

const mobileNav = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/watchlist',         icon: Star,            label: 'Watchlist' },
  { to: '/portfolio',         icon: Briefcase,       label: 'Portfolio' },
  { to: '/announcements',     icon: Bell,            label: 'My News'   },
  { to: '/all-announcements', icon: Globe,           label: 'All News'  },
  { to: '/board-meetings',    icon: Presentation,    label: 'Meetings'  },
  { to: '/agm-updates',       icon: Users,           label: 'AGMs'      },
  { to: '/gainers-losers',    icon: TrendingUp,      label: 'Gain/Loss' },
  { to: '/volume-spurt',      icon: Zap,             label: 'Vol Spurt' },
  { to: '/calendar',          icon: CalendarDays,    label: 'Calendar'  },
  { to: '/company-data',      icon: BarChart2,       label: 'Company'   },
  { to: '/news',              icon: Newspaper,       label: 'Market'    },
  { to: '/bulk-block',        icon: Layers,          label: 'Deals'     },
  { to: '/insider',           icon: Eye,             label: 'Insider'   },

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
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

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
    <div className="min-h-screen bg-background text-textPrimary selection:bg-primary/30 selection:text-white">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Sidebar — desktop only */}
      {isMd && <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />}

      {/* Topbar — desktop only */}
      {isMd && <Topbar sidebarWidth={sidebarWidth} onSearch={() => setSearchOpen(true)} theme={theme} toggleTheme={toggleTheme} />}

      {/* Mobile topbar */}
      {!isMd && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-4 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/5 border border-border shadow-inner">
              <img src="/logo2.png" alt="Logo" className="w-5 h-5 object-contain" />
            </div>
            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400 tracking-tight">Tatvarth</span>
          </div>
          <button onClick={toggleTheme} className="p-2 rounded-xl text-textMuted hover:text-textPrimary bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 transition">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      )}

      {/* Main content */}
      <main
        className={clsx(
          'transition-all duration-300 min-h-screen pb-20 md:pb-8',
          isMd ? 'pt-24 px-8' : 'pt-20 px-4'
        )}
        style={{ paddingLeft: isMd ? `calc(${collapsed ? 72 : 256}px + 2rem)` : undefined }}
      >
        <div className="max-w-7xl mx-auto h-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile bottom nav */}
      {!isMd && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface/90 backdrop-blur-2xl border-t border-border pb-safe shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)]">
          <nav className="w-full overflow-x-auto overflow-y-hidden scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex items-center gap-1 px-2 h-16 min-w-max">
              {mobileNav.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    clsx(
                      'flex flex-col items-center justify-center gap-1 p-2 w-[72px] h-12 rounded-xl transition-all duration-300 relative overflow-hidden',
                      isActive ? 'text-white shadow-premium' : 'text-textMuted hover:text-textPrimary hover:bg-black/5 dark:hover:bg-white/5 font-medium'
                    )
                  }
                >
                  {/* Dynamic background for active state */}
                  {window.location.pathname === to && (
                    <motion.div layoutId="mobileNavBg" className="absolute inset-0 bg-gradient-to-tr from-primary to-blue-500 rounded-xl -z-10" />
                  )}
                  <Icon className={clsx("w-5 h-5 transition-transform z-10", window.location.pathname === to ? "scale-110 drop-shadow-md" : "")} />
                  <span className="text-[10px] whitespace-nowrap z-10 font-semibold tracking-tight">{label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
