import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const SILENT_UPDATE_INTERVAL_MS = 15 * 60_000;

export function PwaUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;
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

    // Updates are discovered quietly. We intentionally do NOT call
    // updateServiceWorker(true), location.reload(), or navigate the client.
    // The active React tree stays mounted while the next worker takes control.
    const timer = window.setInterval(checkForUpdate, SILENT_UPDATE_INTERVAL_MS);
    window.addEventListener('online', checkForUpdate, { passive: true });

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', checkForUpdate);
    };
  }, []);

  return null;
}
