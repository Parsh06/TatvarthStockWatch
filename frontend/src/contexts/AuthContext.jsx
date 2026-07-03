import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import { auth, googleProvider, FIREBASE_ENABLED } from '../services/firebase'

const AuthContext = createContext({
  currentUser:    null,
  loading:        true,
  isDemo:         false,
  login:          async () => {},
  register:       async () => {},
  loginWithGoogle:async () => {},
  logout:         async () => {},
  resetPassword:  async () => {},
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

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      // No credentials — auto-login as demo user so the UI is fully visible
      setCurrentUser(DEMO_USER)
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      setLoading(false)
    })
    return unsubscribe
  }, [])

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
    if (!FIREBASE_ENABLED) {
      setCurrentUser(null)
      return
    }
    return signOut(auth)
  }

  async function resetPassword(email) {
    if (!FIREBASE_ENABLED) throw new Error('Firebase not configured.')
    return sendPasswordResetEmail(auth, email)
  }

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, register, loginWithGoogle, logout, resetPassword, isDemo: !FIREBASE_ENABLED }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
