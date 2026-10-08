import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const SILENT_UPDATE_INTERVAL_MS = 5 * 60_000;

export function PwaUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // VitePWA autoUpdate handles registration; the custom injectManifest SW
  // implements skipWaiting()/clients.claim() itself.
  useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;
      if (registration && navigator.onLine) {
        void registration.update().catch((error) => {
          console.warn('[pwa] initial update check failed', error);
        });
      }
    },
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error);
    },
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let active = true;
    let checking = false;
    let reloaded = false;
    // Do not reload the very first installation / first controller takeover.
    const hadControllerOnMount = Boolean(navigator.serviceWorker.controller);

    const checkForUpdate = async () => {
      if (!active || checking || !navigator.onLine) return;
      checking = true;
      try {
        // iOS can resume an installed PWA without running the registration
        // callback again. Always resolve the current registration as fallback.
        const registration = registrationRef.current ??
          await navigator.serviceWorker.getRegistration('/');
        if (!registration || !active) return;
        registrationRef.current = registration;
        await registration.update();
      } catch (error) {
        console.warn('[pwa] silent update check failed', error);
      } finally {
        checking = false;
      }
    };

    const onControllerChange = () => {
      if (!active || reloaded || !hadControllerOnMount) return;
      reloaded = true;
      // A new SW controls requests now, but an old React bundle may still be
      // in memory. Reload exactly once to activate the latest JS/CSS.
      window.location.reload();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };

    const onPageShow = () => { void checkForUpdate(); };
    const onOnline = () => { void checkForUpdate(); };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const timer = window.setInterval(() => { void checkForUpdate(); }, SILENT_UPDATE_INTERVAL_MS);
    void checkForUpdate();

    return () => {
      active = false;
      window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
