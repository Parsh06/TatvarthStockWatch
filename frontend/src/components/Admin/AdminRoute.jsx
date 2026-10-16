import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAdminAuth } from '../../hooks/useAdminAuth'
import { Preloader } from '../Common/Preloader'
import toast from 'react-hot-toast'

/**
 * AdminRoute
 *
 * Three-level guard:
 *   1. Auth loading  → show Preloader
 *   2. Not admin (role !== 'admin' or read entitlement missing) → redirect to /dashboard
 *   3. Admin with read entitlement → render children
 *
 * The backend independently enforces entitlements on every API call.
 * This component is purely a UX gate.
 */
export default function AdminRoute({ children }) {
  const { loading } = useAuth()
  const { isAdmin } = useAdminAuth()

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error('Admin access required', { id: 'admin-access-denied' })
    }
  }, [loading, isAdmin])

  if (loading) return <Preloader />

  if (!isAdmin) return <Navigate to="/dashboard" replace />

  return children
}
