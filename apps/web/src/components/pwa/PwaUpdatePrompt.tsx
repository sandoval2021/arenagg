import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      // Force an update check every time the PWA boots instead of waiting for
      // the browser's normal update cadence.
      void registration?.update();
    },
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    // registerType=autoUpdate should promote the worker automatically; this is
    // an explicit second line of defense for iOS/Android standalone PWAs.
    void updateServiceWorker(true);
  }, [needRefresh, updateServiceWorker]);

  useEffect(() => {
    const checkForUpdate = () => {
      void navigator.serviceWorker?.getRegistration().then((registration) => registration?.update());
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
