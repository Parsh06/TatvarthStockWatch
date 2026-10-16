import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { auth, db, googleProvider, FIREBASE_ENABLED } from '../services/firebase'

const AuthContext = createContext({
  currentUser:    null,
  loading:        true,
  isDemo:         false,
  role:           'user',
  entitlements:   { read: false, write: false },
  approvalStatus: 'approved',
  rejectedReason: '',
  isApproved:     true,
  isPendingApproval: false,
  isRejected:     false,
  isAdmin:        false,
  canAdminWrite:  false,
  login:          async () => {},
  register:       async () => {},
  loginWithGoogle:async () => {},
  logout:         async () => {},
  resetPassword:  async () => {},
  refreshAdminProfile: async () => {},
})

// Dummy user shown when Firebase credentials are not yet configured
const DEMO_USER = {
  uid: 'demo-user-001',
  email: 'demo@stockwatch.app',
  displayName: 'Demo User',
  photoURL: null,
  emailVerified: true,
  isDemo: true,
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('user')
  const [entitlements, setEntitlements] = useState({ read: false, write: false })
  const [approvalStatus, setApprovalStatus] = useState('approved')
  const [rejectedReason, setRejectedReason] = useState('')

  /**
   * Loads the admin role + entitlements from Firestore for a given Firebase user (fallback/one-shot).
   */
  const loadAdminProfile = useCallback(async (user) => {
    if (!user || !FIREBASE_ENABLED || !db) {
      setRole('user')
      setEntitlements({ read: false, write: false })
      setApprovalStatus('approved')
      return
    }
    try {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (snap.exists()) {
        const data = snap.data() || {}
        const userRole = data.role || 'user'
        setRole(userRole)
        setEntitlements(data.entitlements || { read: false, write: false })
        if (userRole === 'admin') {
          setApprovalStatus('approved')
        } else {
          setApprovalStatus(data.approvalStatus || 'approved')
        }
        setRejectedReason(data.rejectedReason || '')
      } else {
        setRole('user')
        setEntitlements({ read: false, write: false })
        setApprovalStatus('pending')
      }
    } catch (e) {
      console.warn('[AuthContext] Could not load admin profile:', e.message)
    }
  }, [])

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      setCurrentUser(DEMO_USER)
      setRole('admin')
      setEntitlements({ read: true, write: true })
      setApprovalStatus('approved')
      setLoading(false)
      return
    }

    let unsubSnapshot = null

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous Firestore listener if any
      if (unsubSnapshot) {
        unsubSnapshot()
        unsubSnapshot = null
      }

      setCurrentUser(user)

      if (!user) {
        setRole('user')
        setEntitlements({ read: false, write: false })
        setApprovalStatus('approved')
        setRejectedReason('')
        setLoading(false)
        return
      }

      // Attach real-time snapshot listener on the user's Firestore profile
      if (db) {
        try {
          unsubSnapshot = onSnapshot(
            doc(db, 'users', user.uid),
            (snap) => {
              if (snap.exists()) {
                const data = snap.data() || {}
                const userRole = data.role || 'user'
                setRole(userRole)
                setEntitlements(data.entitlements || { read: false, write: false })
                if (userRole === 'admin') {
                  setApprovalStatus('approved')
                } else {
                  setApprovalStatus(data.approvalStatus || 'approved')
                }
                setRejectedReason(data.rejectedReason || '')
              } else {
                // If profile hasn't been created yet, default to pending for safety
                setRole('user')
                setEntitlements({ read: false, write: false })
                setApprovalStatus('pending')
              }
              setLoading(false)
            },
            (err) => {
              console.warn('[AuthContext] Real-time profile snapshot error:', err.message)
              loadAdminProfile(user).finally(() => setLoading(false))
            }
          )
        } catch (e) {
          console.warn('[AuthContext] Failed to attach profile snapshot:', e.message)
          loadAdminProfile(user).finally(() => setLoading(false))
        }
      } else {
        loadAdminProfile(user).finally(() => setLoading(false))
      }
    })

    return () => {
      unsubAuth()
      if (unsubSnapshot) unsubSnapshot()
    }
  }, [loadAdminProfile])

  async function register(email, password, displayName) {
    if (!FIREBASE_ENABLED) throw new Error('Firebase not configured — add credentials to .env to enable sign-up.')
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) await updateProfile(cred.user, { displayName })
    // Create Firestore user profile on first sign-up
    try {
      const { ensureUserProfile } = await import('../services/alertService')
      await ensureUserProfile(cred.user.uid, { displayName, email })
    } catch (e) {
      console.warn('[Auth] Could not create user profile:', e.message)
    }
    return cred
  }

  async function login(email, password) {
    if (!FIREBASE_ENABLED) {
      // Accept any credentials in demo mode
      setCurrentUser({ ...DEMO_USER, email, displayName: email.split('@')[0] })
      return { user: DEMO_USER }
    }
    return signInWithEmailAndPassword(auth, email, password)
  }

  async function loginWithGoogle() {
    if (!FIREBASE_ENABLED) throw new Error('Firebase not configured — add credentials to .env to enable Google sign-in.')
    const cred = await signInWithPopup(auth, googleProvider)
    try {
      const { ensureUserProfile } = await import('../services/alertService')
      await ensureUserProfile(cred.user.uid, { displayName: cred.user.displayName, email: cred.user.email })
    } catch {}
    return cred
  }

  async function logout() {
    // Clean up push subscription for this device before signing out
    try {
      const deviceId = localStorage.getItem('sw_push_device_id')
      if (deviceId && FIREBASE_ENABLED) {
        const { apiClient } = await import('../services/apiClient')
        await apiClient('/api/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ deviceId }),
        }).catch(() => {}) // best-effort — don't block logout
      }
    } catch {
      // Silently fail — logout should always succeed
    }

    if (!FIREBASE_ENABLED) {
      setCurrentUser(null)
      setRole('user')
      setEntitlements({ read: false, write: false })
      return
    }
    return signOut(auth)
  }

  async function resetPassword(email) {
    if (!FIREBASE_ENABLED) throw new Error('Firebase not configured.')
    return sendPasswordResetEmail(auth, email)
  }

  /**
   * Force-refresh the admin profile from Firestore.
   * Call this after changing your own role or after the admin updates themselves.
   */
  async function refreshAdminProfile() {
    if (currentUser) await loadAdminProfile(currentUser)
  }

  const isAdmin = role === 'admin' && entitlements?.read === true
  const canAdminWrite = role === 'admin' && entitlements?.write === true
  const isApproved = role === 'admin' || approvalStatus === 'approved'
  const isPendingApproval = role !== 'admin' && approvalStatus === 'pending'
  const isRejected = role !== 'admin' && approvalStatus === 'rejected'

  return (
    <AuthContext.Provider value={{
      currentUser, loading,
      role, entitlements,
      approvalStatus, rejectedReason,
      isApproved, isPendingApproval, isRejected,
      isAdmin, canAdminWrite,
      login, register, loginWithGoogle, logout, resetPassword,
      refreshAdminProfile,
      isDemo: !FIREBASE_ENABLED,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
