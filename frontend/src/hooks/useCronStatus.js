import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db, FIREBASE_ENABLED } from '../services/firebase'

export function useCronStatus() {
  const [cronStatus, setCronStatus] = useState(null)

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !auth?.currentUser) return

    const unsub = onSnapshot(doc(db, 'system_meta', 'cron_status'), (docSnap) => {
      if (docSnap.exists()) {
        setCronStatus(docSnap.data())
      }
    }, (err) => {
      // Quietly ignore permission error if auth status changes
    })
    return () => unsub()
  }, [])

  return cronStatus
}
