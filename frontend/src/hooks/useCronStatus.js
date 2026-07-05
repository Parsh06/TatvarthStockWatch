import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'

export function useCronStatus() {
  const [cronStatus, setCronStatus] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_meta', 'cron_status'), (docSnap) => {
      if (docSnap.exists()) {
        setCronStatus(docSnap.data())
      }
    }, (err) => {
      console.warn('Cron status listener error:', err)
    })
    return () => unsub()
  }, [])

  return cronStatus
}
