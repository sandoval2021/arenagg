import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const SILENT_UPDATE_INTERVAL_MS = 15 * 60_000;

export function PwaUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

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
    const checkForUpdate = () => {
      const registration = registrationRef.current;
      if (!registration || !navigator.onLine || document.visibilityState !== 'visible') return;
      void registration.update().catch((error) => {
        console.warn('[pwa] silent update check failed', error);
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    const timer = window.setInterval(checkForUpdate, SILENT_UPDATE_INTERVAL_MS);
    window.addEventListener('online', checkForUpdate, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
