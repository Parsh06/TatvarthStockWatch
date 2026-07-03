import { useState, useEffect } from 'react'

export function useRatesSocket() {
  const [liveRates, setLiveRates] = useState({})
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    let isMounted = true;
    let pollTimer = null;

    const fetchRates = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/rates`);
        if (!res.ok) throw new Error('Failed to fetch rates');
        const data = await res.json();
        
        if (isMounted) {
          setIsConnected(true);
          if (data && data.rates) {
            setLiveRates(prev => ({ ...prev, ...data.rates }));
          }
        }
      } catch (err) {
        if (isMounted) setIsConnected(false);
      }
    };

    // Initial fetch
    fetchRates();

    // Poll every 10 seconds
    pollTimer = setInterval(fetchRates, 10000);

    return () => {
      isMounted = false;
      if (pollTimer) clearInterval(pollTimer);
    }
  }, [])

  return { liveRates, isConnected }
}
