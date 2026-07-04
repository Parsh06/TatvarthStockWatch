import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, Sun, Moon, ChevronDown, LogOut, User, Search } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import { getNotifications, markAllNotificationsRead } from '../../services/announcementService'
import { formatRelativeDate } from '../../utils/formatters'
import toast from 'react-hot-toast'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/watchlist': 'My Watchlist',
  '/announcements': 'Announcements',
  '/settings': 'Settings',
}

export default function Topbar({ sidebarWidth, onSearch, theme, toggleTheme }) {
  const { currentUser, logout } = useAuth()
  const location = useLocation()
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const notifRef = useRef(null)
  const userRef = useRef(null)

  const pageTitle = PAGE_TITLES[location.pathname] || 'TatvarthStockWatch'
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!currentUser) return
    getNotifications(currentUser.uid).then(setNotifications).catch(() => {})
  }, [currentUser])

  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleMarkAllRead() {
    if (!currentUser) return
    try {
      await markAllNotificationsRead(currentUser.uid)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      toast.error('Failed to mark notifications as read')
    }
  }

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser?.email?.[0]?.toUpperCase() || 'U'

  return (
    <header
      className="fixed top-0 right-0 h-24 bg-background/40 backdrop-blur-md border-b border-white/5 flex items-end pb-4 px-8 z-20 transition-all duration-300"
      style={{ left: `calc(${sidebarWidth}px + 2rem)` }}
    >
      <h1 className="text-2xl font-bold tracking-tight text-textPrimary flex-1">{pageTitle}</h1>

      <div className="flex items-center gap-2">
        {/* Global Search */}
        <button
          onClick={onSearch}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-textMuted hover:text-textPrimary hover:border-primary/40 transition"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <kbd className="ml-1 px-1.5 py-0.5 bg-border/60 rounded text-[10px] font-mono">Ctrl K</kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-textMuted hover:text-textPrimary hover:bg-black/5 dark:hover:bg-white/5 transition"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-textMuted hover:text-textPrimary hover:bg-white/5 transition relative"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger rounded-full text-white text-xs flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-12 w-80 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-medium text-textPrimary text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="text-xs text-primary hover:text-primary/80">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-textMuted text-sm">No notifications</div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      className={clsx('px-4 py-3 border-b border-border/50 hover:bg-white/5 transition', !n.read && 'bg-primary/5')}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-medium text-textMuted">{n.scriptName}</span>
                      </div>
                      <p className="text-sm text-textPrimary line-clamp-2">{n.subject || n.message || n.title}</p>
                      <p className="text-xs text-textMuted mt-1">{formatRelativeDate(n.createdAt?.toDate?.() || n.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-white/5 transition"
          >
            <div className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-primary text-xs font-bold">
              {initials}
            </div>
            <span className="text-sm text-textPrimary hidden sm:block max-w-[120px] truncate">
              {currentUser?.displayName || currentUser?.email}
            </span>
            <ChevronDown className="w-3 h-3 text-textMuted" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-12 w-52 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-textPrimary truncate">{currentUser?.displayName || 'User'}</p>
                <p className="text-xs text-textMuted truncate">{currentUser?.email}</p>
              </div>
              <button
                onClick={async () => { await logout(); toast.success('Signed out') }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-textMuted hover:text-danger hover:bg-danger/10 transition"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
