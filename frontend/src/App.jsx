import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WatchlistProvider } from './contexts/WatchlistContext'
import { AnnouncementsProvider } from './contexts/AnnouncementsContext'
import { trackPageView } from './services/firebase'
import LoginPage from './components/Auth/LoginPage'
import DashboardPage from './components/Dashboard/DashboardPage'
import WatchlistPage from './components/Watchlist/WatchlistPage'
import AnnouncementsPage from './components/Announcements/AnnouncementsPage'
import AllAnnouncementsPage from './components/AllAnnouncements/AllAnnouncementsPage'
import BoardMeetingsPage from './components/BoardMeetings/BoardMeetingsPage'
import AGMUpdatesPage from './components/AGMUpdates/AGMUpdatesPage'
import ResultCalendarPage from './components/ResultCalendar/ResultCalendarPage'
import IPOGmpPage from './components/IPO/IPOGmpPage'
import IpoVerificationPage from './components/IpoVerification/IpoVerificationPage'
import OFSPage from './components/OFS/OFSPage'
import BulkBlockPage from './components/BulkBlock/BulkBlockPage'
import CompanyDataPage from './components/CompanyData/CompanyDataPage'
import NewsPage from './components/News/NewsPage'
import GainersLosersPage from './components/GainersLosers/GainersLosersPage'
import VolumeSpurtPage from './components/VolumeSpurt/VolumeSpurtPage'
import SettingsPage from './components/Settings/SettingsPage'
import CorporateCalendarPage from './components/CorporateCalendar/CorporateCalendarPage'
import InsiderTradingPage from './components/InsiderTrading/InsiderTradingPage'
import AppLayout from './components/Layout/AppLayout'
import SecurityGuard from './components/SecurityGuard/SecurityGuard'
import CommandPalette from './components/Common/CommandPalette'
import OfflineBanner from './components/Common/OfflineBanner'
import AdminRoute from './components/Admin/AdminRoute'
import AdminPage from './components/Admin/AdminPage'
import PublicBasketPage from './components/Watchlist/PublicBasketPage'

import PendingApprovalPage from './components/Auth/PendingApprovalPage'
import AccessRejectedPage from './components/Auth/AccessRejectedPage'
import AccountDisabledPage from './components/Auth/AccountDisabledPage'
import PlansPage from './components/Plans/PlansPage'
import WelcomePage from './components/Welcome/WelcomePage'

import { Preloader } from './components/Common/Preloader'

function FirebaseAnalyticsTracker() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname + location.search, document.title)
  }, [location])

  return null
}

function ProtectedRoute({ children }) {
  const { currentUser, loading, role, approvalStatus, rejectedReason, isDisabled, disabledReason } = useAuth()
  if (loading) {
    return <Preloader />
  }

  // Account disabled by admin (highest precedence: blocks all roles including admin!)
  if (isDisabled) {
    return <AccountDisabledPage reason={disabledReason} />
  }

  if (!currentUser) return <Navigate to="/login" replace />

  // Admins bypass approval gate
  if (role === 'admin') {
    return children
  }

  // Account waiting for admin approval
  if (approvalStatus === 'pending') {
    return <PendingApprovalPage />
  }

  // Account access rejected by admin
  if (approvalStatus === 'rejected') {
    return <AccessRejectedPage reason={rejectedReason} />
  }

  return children
}

function PublicRoute({ children }) {
  const { currentUser, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return <Preloader />
  }
  if (currentUser) {
    const params = new URLSearchParams(location.search)
    const plan = params.get('plan')
    const redirectUrl = params.get('redirect') || (plan && plan !== 'basic' ? `/plans?select=${plan}` : '/dashboard')
    return <Navigate to={redirectUrl} replace />
  }
  return children
}

function AppRoutes() {
  const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')

  return (
    <>
      {isVercel && <Analytics />}
      <FirebaseAnalyticsTracker />
      <OfflineBanner />
      <CommandPalette />
      <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/account-disabled" element={<AccountDisabledPage />} />
      <Route path="/" element={<WelcomePage />} />
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/landing" element={<WelcomePage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/watchlist"
        element={
          <ProtectedRoute>
            <AppLayout>
              <WatchlistPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/announcements"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AnnouncementsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/all-announcements"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AllAnnouncementsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/board-meetings"
        element={
          <ProtectedRoute>
            <AppLayout>
              <BoardMeetingsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/agm-updates"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AGMUpdatesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/result-calendar"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ResultCalendarPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ipo-gmp"
        element={
          <ProtectedRoute>
            <AppLayout>
              <IPOGmpPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ofs"
        element={
          <ProtectedRoute>
            <AppLayout>
              <OFSPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ipo-check"
        element={
          <ProtectedRoute>
            <AppLayout>
              <IpoVerificationPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/news"
        element={
          <ProtectedRoute>
            <AppLayout>
              <NewsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/gainers-losers"
        element={
          <ProtectedRoute>
            <AppLayout>
              <GainersLosersPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/volume-spurt"
        element={
          <ProtectedRoute>
            <AppLayout>
              <VolumeSpurtPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bulk-block"
        element={
          <ProtectedRoute>
            <AppLayout>
              <BulkBlockPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/company-data"
        element={
          <ProtectedRoute>
            <AppLayout>
              <CompanyDataPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SettingsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <AppLayout>
              <CorporateCalendarPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/insider"
        element={
          <ProtectedRoute>
            <AppLayout>
              <InsiderTradingPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <AppLayout>
                <AdminPage />
              </AppLayout>
            </AdminRoute>
          </ProtectedRoute>
        }
      />
      {/* ── Public Shareable Curated Watchlist Basket Route ── */}
      <Route path="/basket/:slug" element={<PublicBasketPage />} />

      {/* ── Membership Plans & Pricing ── */}
      <Route
        path="/plans"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PlansPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pricing"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PlansPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SecurityGuard />
      <AuthProvider>
        <WatchlistProvider>
          <AnnouncementsProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                className: '!bg-surface !text-textPrimary !border !border-border !rounded-xl !shadow-lg',
                success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
                error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
              }}
            />
            <AppRoutes />
          </AnnouncementsProvider>
        </WatchlistProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
