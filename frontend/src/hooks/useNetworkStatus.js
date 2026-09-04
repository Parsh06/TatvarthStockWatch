import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useNetworkStatus Hook
 *
 * Provides real-time network connectivity and quality telemetry.
 * Listens to window online/offline events, inspects the Network Information API
 * (navigator.connection), and provides a manual active ping check.
 *
 * @returns {{
 *   isOnline: boolean,
 *   isSlow: boolean,
 *   effectiveType: string,
 *   downlink: number|null,
 *   rtt: number|null,
 *   wasOffline: boolean,
 *   checking: boolean,
 *   checkConnection: () => Promise<boolean>
 * }}
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [isSlow, setIsSlow] = useState(false)
  const [effectiveType, setEffectiveType] = useState('4g')
  const [downlink, setDownlink] = useState(null)
  const [rtt, setRtt] = useState(null)
  const [wasOffline, setWasOffline] = useState(false)
  const [checking, setChecking] = useState(false)
  const restoredTimerRef = useRef(null)

  // Inspect Network Information API if supported
  const updateConnectionInfo = useCallback(() => {
    if (typeof navigator === 'undefined') return

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (conn) {
      const type = conn.effectiveType || '4g'
      setEffectiveType(type)
      setDownlink(conn.downlink || null)
      setRtt(conn.rtt || null)

      // Mark connection as slow if on 2g, slow-2g, or RTT > 2000ms
      const slow = type === 'slow-2g' || type === '2g' || (conn.rtt && conn.rtt > 2500)
      setIsSlow(slow)
    }
  }, [])

  // Active ping to verify real server reachability
  const checkConnection = useCallback(async () => {
    setChecking(true)
    try {
      // Fast cache-busted lightweight probe
      const res = await fetch(`/api/health?_t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const online = res.ok || res.status < 500
      setIsOnline(online)
      setChecking(false)
      return online
    } catch {
      setIsOnline(false)
      setChecking(false)
      return false
    }
  }, [])

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      setWasOffline(true)
      updateConnectionInfo()

      // Keep "Restored" indicator visible for 4 seconds then clear
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current)
      restoredTimerRef.current = setTimeout(() => {
        setWasOffline(false)
      }, 4000)
    }

    function handleOffline() {
      setIsOnline(false)
      setWasOffline(false)
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (conn && conn.addEventListener) {
      conn.addEventListener('change', updateConnectionInfo)
    }

    updateConnectionInfo()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (conn && conn.removeEventListener) {
        conn.removeEventListener('change', updateConnectionInfo)
      }
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current)
    }
  }, [updateConnectionInfo])

  return {
    isOnline,
    isSlow,
    effectiveType,
    downlink,
    rtt,
    wasOffline,
    checking,
    checkConnection,
  }
}
