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

export const PLAN_LIMITS = {
  basic: {
    name: 'Basic',
    priceMonthly: 0,
    priceAnnual: 0,
    maxWatchlist: 5,
    maxDailyAi: 3,
    maxAiDaily: 3,
    maxFamilyPans: 1,
    maxBaskets: 3,
    maxCuratedBaskets: 3,
    canExport: false,
    canExportCsv: false,
    canUseRadar: false,
  },
  pro: {
    name: 'Pro',
    priceMonthly: 999,
    priceAnnual: 8999,
    maxWatchlist: 50,
    maxDailyAi: Infinity,
    maxAiDaily: Infinity,
    maxFamilyPans: 10,
    maxBaskets: 10,
    maxCuratedBaskets: 10,
    canExport: true,
    canExportCsv: true,
    canUseRadar: false,
  },
  premium: {
    name: 'Premium HNI',
    priceMonthly: 1999,
    priceAnnual: 17999,
    maxWatchlist: Infinity,
    maxDailyAi: Infinity,
    maxAiDaily: Infinity,
    maxFamilyPans: Infinity,
    maxBaskets: Infinity,
    maxCuratedBaskets: Infinity,
    canExport: true,
    canExportCsv: true,
    canUseRadar: true,
  },
}

const AuthContext = createContext({
  currentUser:    null,
  loading:        true,
  isDemo:         false,
  role:           'user',
  entitlements:   { read: false, write: false },
  approvalStatus: 'approved',
  rejectedReason: '',
  isDisabled:     false,
  disabledReason: '',
  plan:           'basic',
  planStatus:     'active',
  planExpiresAt:  null,
  isPro:          false,
  isPremium:      false,
  dailyAiCount:   0,
  planLimits:     PLAN_LIMITS.basic,
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
  const [isDisabled, setIsDisabled] = useState(false)
  const [disabledReason, setDisabledReason] = useState('')
  const [plan, setPlan] = useState('basic')
  const [planStatus, setPlanStatus] = useState('active')
  const [planExpiresAt, setPlanExpiresAt] = useState(null)
  const [dailyAiCount, setDailyAiCount] = useState(0)

  // Listen for global account-disabled lockdown events (e.g. from apiClient 403)
  useEffect(() => {
    function handleAccountDisabledEvent(e) {
      console.warn('[AuthContext] Account disabled event received:', e.detail)
      setIsDisabled(true)
      if (e.detail?.reason) {
        setDisabledReason(e.detail.reason)
      }
    }
    window.addEventListener('sw:account-disabled', handleAccountDisabledEvent)
    return () => window.removeEventListener('sw:account-disabled', handleAccountDisabledEvent)
  }, [])

  /**
   * Helper to parse and update user plan state from Firestore data.
   */
  const applyPlanState = useCallback((data) => {
    const userPlan = (data.plan || 'basic').toLowerCase()
    let expires = null
    let isExpired = false
    if (data.planExpiresAt) {
      expires = data.planExpiresAt?.toDate ? data.planExpiresAt.toDate() : new Date(data.planExpiresAt)
      if (expires && !isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
        isExpired = true
      }
    }

    const effectivePlan = (userPlan !== 'basic' && isExpired) ? 'basic' : (PLAN_LIMITS[userPlan] ? userPlan : 'basic')
    setPlan(effectivePlan)
    setPlanStatus(isExpired ? 'expired' : (data.planStatus || 'active'))
    setPlanExpiresAt(expires)

    // Calculate today's date in IST
    const todayIST = new Date(Date.now() + (5.5 * 3600000)).toISOString().split('T')[0]
    if (data.dailyAiUsage?.date === todayIST) {
      setDailyAiCount(Number(data.dailyAiUsage?.count || 0))
    } else {
      setDailyAiCount(0)
    }
  }, [])

  /**
   * Loads the admin role + entitlements from Firestore for a given Firebase user (fallback/one-shot).
   */
  const loadAdminProfile = useCallback(async (user) => {
    if (!user || !FIREBASE_ENABLED || !db) {
      setRole('user')
      setEntitlements({ read: false, write: false })
      setApprovalStatus('approved')
      setIsDisabled(false)
      setDisabledReason('')
      setPlan('basic')
      setPlanStatus('active')
      setPlanExpiresAt(null)
      setDailyAiCount(0)
      return
    }
    try {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (snap.exists()) {
        const data = snap.data() || {}
        const isUserDisabled = Boolean(data.disabled)
        setIsDisabled(isUserDisabled)
        setDisabledReason(data.disabledReason || (isUserDisabled ? 'Your account access has been suspended by an administrator.' : ''))

        const userRole = data.role || 'user'
        setRole(userRole)
        setEntitlements(data.entitlements || { read: false, write: false })
        if (userRole === 'admin') {
          setApprovalStatus('approved')
        } else {
          setApprovalStatus(data.approvalStatus || 'approved')
        }
        setRejectedReason(data.rejectedReason || '')

        applyPlanState(data)
      } else {
        setRole('user')
        setEntitlements({ read: false, write: false })
        setApprovalStatus('pending')
        setIsDisabled(false)
        setDisabledReason('')
        setPlan('basic')
        setPlanStatus('active')
        setPlanExpiresAt(null)
        setDailyAiCount(0)
      }
    } catch (e) {
      console.warn('[AuthContext] Could not load admin profile:', e.message)
    }
  }, [applyPlanState])

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      setCurrentUser(DEMO_USER)
      setRole('admin')
      setEntitlements({ read: true, write: true })
      setApprovalStatus('approved')
      setIsDisabled(false)
      setDisabledReason('')
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
        setIsDisabled(false)
        setDisabledReason('')
        setPlan('basic')
        setPlanStatus('active')
        setPlanExpiresAt(null)
        setDailyAiCount(0)
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
                const isUserDisabled = Boolean(data.disabled)
                setIsDisabled(isUserDisabled)
                setDisabledReason(data.disabledReason || (isUserDisabled ? 'Your account access has been suspended by an administrator.' : ''))

                const userRole = data.role || 'user'
                setRole(userRole)
                setEntitlements(data.entitlements || { read: false, write: false })
                if (userRole === 'admin') {
                  setApprovalStatus('approved')
                } else {
                  setApprovalStatus(data.approvalStatus || 'approved')
                }
                setRejectedReason(data.rejectedReason || '')

                applyPlanState(data)

                // If user is pending and notification has not been sent yet, trigger background catchup ping
                if (data.approvalStatus === 'pending' && !data.approvalNotificationSent) {
                  import('../services/apiClient').then(({ apiClient }) => {
                    apiClient.post('/api/auth/onboarding-request', {
                      displayName: user.displayName || data.displayName,
                      email: user.email || data.email,
                    }).catch(() => {})
                  }).catch(() => {})
                }
              } else {
                // If profile hasn't been created yet, default to pending for safety and sync
                setRole('user')
                setEntitlements({ read: false, write: false })
                setApprovalStatus('pending')
                setIsDisabled(false)
                setDisabledReason('')
                setPlan('basic')
                setPlanStatus('active')
                setPlanExpiresAt(null)
                setDailyAiCount(0)

                import('../services/alertService').then(({ ensureUserProfile }) => {
                  ensureUserProfile(user.uid, {
                    displayName: user.displayName,
                    email: user.email,
                  }).catch(() => {})
                }).catch(() => {})
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
    const cred = await signInWithEmailAndPassword(auth, email, password)
    try {
      const { ensureUserProfile } = await import('../services/alertService')
      await ensureUserProfile(cred.user.uid, {
        displayName: cred.user.displayName,
        email: cred.user.email,
      })
    } catch (e) {
      console.warn('[Auth] Profile sync on login warning:', e.message)
    }
    return cred
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

  const isPro = role === 'admin' || plan === 'pro' || plan === 'premium'
  const isPremium = role === 'admin' || plan === 'premium'
  const currentLimits = role === 'admin' ? PLAN_LIMITS.premium : (PLAN_LIMITS[plan] || PLAN_LIMITS.basic)

  return (
    <AuthContext.Provider value={{
      currentUser, loading,
      role, entitlements,
      approvalStatus, rejectedReason,
      isDisabled, disabledReason,
      isApproved, isPendingApproval, isRejected,
      isAdmin, canAdminWrite,
      plan, planStatus, planExpiresAt,
      isPro, isPremium,
      dailyAiCount,
      planLimits: currentLimits,
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
