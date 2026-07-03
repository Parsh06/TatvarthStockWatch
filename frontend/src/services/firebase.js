import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// If no API key is set (credentials not yet configured), skip Firebase init
// entirely so the app renders in "demo mode" without throwing auth/invalid-api-key.
export const FIREBASE_ENABLED = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

let _auth = null
let _db = null
let _googleProvider = null
let _analytics = null

if (FIREBASE_ENABLED) {
  const app = initializeApp(firebaseConfig)
  _auth = getAuth(app)
  _db = getFirestore(app)
  _googleProvider = new GoogleAuthProvider()
  
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    // Dynamically import analytics so adblockers (ERR_BLOCKED_BY_CLIENT) don't crash the entire app in dev mode
    import('firebase/analytics').then(({ getAnalytics, isSupported }) => {
      isSupported().then(supported => {
        if (supported) _analytics = getAnalytics(app)
      })
    }).catch(e => console.warn('Firebase Analytics blocked by adblocker', e))
  }
}

export const auth = _auth
export const db = _db
export const googleProvider = _googleProvider
export const analytics = _analytics
