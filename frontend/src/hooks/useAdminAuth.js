/**
 * useAdminAuth.js
 *
 * Convenience hook that exposes admin-specific auth properties.
 * Derives isAdmin and canAdminWrite from AuthContext.
 *
 * Usage:
 *   const { isAdmin, canRead, canWrite } = useAdminAuth()
 */

import { useAuth } from '../contexts/AuthContext'

export function useAdminAuth() {
  const { role, entitlements, isAdmin, canAdminWrite, refreshAdminProfile } = useAuth()

  return {
    /** True only when role === 'admin' AND entitlements.read === true */
    isAdmin,

    /** True when user has read entitlement (also implies isAdmin) */
    canRead: isAdmin,

    /** True when user has both admin role AND write entitlement */
    canWrite: canAdminWrite,

    /** Raw role string — 'admin' | 'user' */
    role,

    /** Raw entitlements object — { read: boolean, write: boolean } */
    entitlements,

    /** Force-refresh role/entitlements from Firestore (after admin self-changes) */
    refreshAdminProfile,
  }
}
