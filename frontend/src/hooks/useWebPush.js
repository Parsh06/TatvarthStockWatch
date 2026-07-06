import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/apiClient';
import toast from 'react-hot-toast';

export function useWebPush() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      
      // Check if already subscribed on mount
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          if (sub) setIsSubscribed(true);
        }).catch(err => console.error('Error checking subscription:', err));
      });
    }
  }, []);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
  
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
  
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const withTimeout = (promise, ms, message) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
  };

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      toast.error('Web Push is not supported in this browser.');
      return false;
    }
    
    setLoading(true);
    try {
      // 1. Request Permission
      const perm = await withTimeout(
        Notification.requestPermission(),
        10000,
        'Permission request timed out. Please check your browser notification settings.'
      );
      
      setPermission(perm);
      if (perm !== 'granted') {
        throw new Error('Notification permission denied by user.');
      }

      // 2. Register Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await withTimeout(
        navigator.serviceWorker.ready,
        10000,
        'Service Worker activation timed out. If you are in Private/Incognito mode, push notifications are blocked.'
      );

      // 3. Get Public Key from Backend
      const { publicKey } = await withTimeout(
        apiClient('/api/push/public-key'),
        10000,
        'Network timeout while fetching encryption keys.'
      );
      
      if (!publicKey) {
        throw new Error('VAPID public key not found on server. Did you add it to Vercel env?');
      }

      // 4. Subscribe to PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // 5. Send Subscription to Backend
      await apiClient('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription)
      });

      setIsSubscribed(true);
      toast.success('Successfully subscribed to browser notifications!');
      return true;
    } catch (err) {
      console.error('Failed to subscribe to web push:', err);
      toast.error(`Subscription failed: ${err.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);
  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }
      
      // Tell backend to remove it from DB
      await apiClient('/api/push/unsubscribe', { method: 'POST' }).catch(err => {
        console.error('Backend unsubscribe failed:', err);
      });
      
      setIsSubscribed(false);
      toast.success('Unsubscribed from browser notifications.');
      return true;
    } catch (err) {
      console.error('Failed to unsubscribe:', err);
      toast.error('Failed to unsubscribe');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe
  };
}
