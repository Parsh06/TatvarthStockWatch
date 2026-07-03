import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { getUserTier, upgradeToPremium } from '../services/alertService'

const TierContext = createContext({
  tier:      'free',
  isPremium: false,
  limits:    { maxScripts: 10, priceAlerts: false, emailAlerts: false },
  upgrade:   async () => {},
})

export const FREE_LIMITS = {
  maxScripts:   10,
  priceAlerts:  false,
  emailAlerts:  false,
  realTimeRates: false,
}

export const PREMIUM_FEATURES = {
  maxScripts:   Infinity,
  priceAlerts:  true,
  emailAlerts:  true,
  realTimeRates: true,
}

export function TierProvider({ children }) {
  const { currentUser, isDemo } = useAuth()
  const [tier, setTier]         = useState('free')
  const [loading, setLoading]   = useState(true)

  const refresh = useCallback(async () => {
    if (!currentUser) { setTier('free'); setLoading(false); return }
    setLoading(true)
    try {
      const t = await getUserTier(currentUser.uid)
      setTier(t)
    } catch {
      setTier('free')
    } finally {
      setLoading(false)
    }
  }, [currentUser])

  useEffect(() => { refresh() }, [refresh])

  const isPremium = tier === 'premium' || isDemo  // demo/local = full access

  const upgrade = useCallback(async () => {
    if (!currentUser) return
    await upgradeToPremium(currentUser.uid)
    setTier('premium')
  }, [currentUser])

  const value = useMemo(() => ({
    tier, isPremium, loading,
    limits: isPremium ? PREMIUM_FEATURES : FREE_LIMITS,
    upgrade, refresh,
  }), [tier, isPremium, loading, upgrade, refresh])

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>
}

export function useTier() {
  return useContext(TierContext)
}
