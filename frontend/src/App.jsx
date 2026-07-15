import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WatchlistProvider } from './contexts/WatchlistContext'
import { TierProvider } from './contexts/TierContext'
import LoginPage from './components/Auth/LoginPage'
import RegisterPage from './components/Auth/RegisterPage'
import DashboardPage from './components/Dashboard/DashboardPage'
import WatchlistPage from './components/Watchlist/WatchlistPage'
import AnnouncementsPage from './components/Announcements/AnnouncementsPage'
import AllAnnouncementsPage from './components/AllAnnouncements/AllAnnouncementsPage'
import BoardMeetingsPage from './components/BoardMeetings/BoardMeetingsPage'
import AGMUpdatesPage from './components/AGMUpdates/AGMUpdatesPage'
import BulkBlockPage from './components/BulkBlock/BulkBlockPage'
import CompanyDataPage from './components/CompanyData/CompanyDataPage'
import NewsPage from './components/News/NewsPage'
import GainersLosersPage from './components/GainersLosers/GainersLosersPage'
import VolumeSpurtPage from './components/VolumeSpurt/VolumeSpurtPage'

import PremiumPage from './components/Premium/PremiumPage'
import SettingsPage from './components/Settings/SettingsPage'
import PortfolioPage from './components/Portfolio/PortfolioPage'
import CorporateCalendarPage from './components/CorporateCalendar/CorporateCalendarPage'
import InsiderTradingPage from './components/InsiderTrading/InsiderTradingPage'
import AppLayout from './components/Layout/AppLayout'
import SecurityGuard from './components/SecurityGuard/SecurityGuard'
import CommandPalette from './components/Common/CommandPalette'

import { Preloader } from './components/Common/Preloader'

function ProtectedRoute({ children }) {
  const { currentUser, loading } = useAuth()
  if (loading) {
    return <Preloader />
  }
  if (!currentUser) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { currentUser, loading } = useAuth()
  if (loading) {
    return <Preloader />
  }
  if (currentUser) return <Navigate to="/dashboard" replace />
  return children
}

function AppRoutes() {
  return (
    <>
      <CommandPalette />
      <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
        path="/premium"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PremiumPage />
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
        path="/portfolio"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PortfolioPage />
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
        <TierProvider>
        <WatchlistProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1E293B',
                color: '#F1F5F9',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '14px',
              },
              success: {
                iconTheme: { primary: '#10B981', secondary: '#1E293B' },
              },
              error: {
                iconTheme: { primary: '#EF4444', secondary: '#1E293B' },
              },
            }}
          />
        </WatchlistProvider>
        </TierProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
