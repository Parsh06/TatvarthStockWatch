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
let _analyticsPromise = null

if (FIREBASE_ENABLED) {
  const app = initializeApp(firebaseConfig)
  _auth = getAuth(app)
  _db = getFirestore(app)
  _googleProvider = new GoogleAuthProvider()
  
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    // Dynamically import analytics so adblockers don't crash the app
    _analyticsPromise = import('firebase/analytics').then(async ({ getAnalytics, isSupported, logEvent }) => {
      const supported = await isSupported().catch(() => false)
      if (supported) {
        _analytics = getAnalytics(app)
        return { analytics: _analytics, logEvent }
      }
      return null
    }).catch(e => {
      console.warn('[Firebase Analytics] Blocked by client or unsupported:', e.message)
      return null
    })
  }
}

export async function logFirebaseEvent(eventName, eventParams = {}) {
  try {
    if (!_analyticsPromise) return
    const res = await _analyticsPromise
    if (res?.analytics && res?.logEvent) {
      res.logEvent(res.analytics, eventName, eventParams)
    }
  } catch (err) {
    // Silently ignore analytics errors to keep app flawless
  }
}

export async function trackPageView(pagePath, pageTitle) {
  return logFirebaseEvent('page_view', {
    page_path: pagePath || (typeof window !== 'undefined' ? window.location.pathname : '/'),
    page_title: pageTitle || (typeof document !== 'undefined' ? document.title : ''),
    page_location: typeof window !== 'undefined' ? window.location.href : '',
  })
}

export const auth = _auth
export const db = _db
export const googleProvider = _googleProvider
export const analytics = _analytics

