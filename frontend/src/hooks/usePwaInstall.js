import { useState, useEffect, useCallback } from 'react';

/**
 * Global beforeinstallprompt listener to ensure prompt is never missed
 * even if a component mounts after the event has fired.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pwaDeferredPrompt = e;
  });
}

/**
 * usePwaInstall hook
 *
 * Provides reactive PWA install state, prompt handler, and platform detection.
 * Works universally on iOS Safari, Android Chrome, and Desktop Chrome/Edge/Firefox.
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(() => {
    return (typeof window !== 'undefined' && window.__pwaDeferredPrompt) || null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // 1. Check if already installed or running in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');

    if (isStandalone) {
      setIsInstalled(true);
    }

    // 2. Check for iOS (iPhone, iPad, iPod)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

    setIsIos(isIosDevice);

    if (window.__pwaDeferredPrompt) {
      setDeferredPrompt(window.__pwaDeferredPrompt);
    }

    // 3. Listen for browser's beforeinstallprompt (Chrome, Edge, Android)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      window.__pwaDeferredPrompt = e;
      setDeferredPrompt(e);
    };

    // 4. Listen for appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      window.__pwaDeferredPrompt = null;
      setDeferredPrompt(null);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const prompt = deferredPrompt || (typeof window !== 'undefined' && window.__pwaDeferredPrompt);
    if (prompt) {
      try {
        prompt.prompt();
        const choiceResult = await prompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          setIsInstalled(true);
        }
        window.__pwaDeferredPrompt = null;
        setDeferredPrompt(null);
        return choiceResult;
      } catch (err) {
        console.warn('[PWA] Prompt error:', err.message);
      }
    }

    // If no native prompt available or on iOS, open the guidance sheet
    setShowModal(true);
    return { outcome: 'modal' };
  }, [deferredPrompt]);

  const openModal = useCallback(() => setShowModal(true), []);
  const closeModal = useCallback(() => setShowModal(false), []);

  return {
    isInstalled,
    isIos,
    hasNativePrompt: Boolean(deferredPrompt || (typeof window !== 'undefined' && window.__pwaDeferredPrompt)),
    showModal,
    openModal,
    closeModal,
    promptInstall,
  };
}
