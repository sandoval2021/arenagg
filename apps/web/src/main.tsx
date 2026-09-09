import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { router } from './app/router';
import { AuthProvider } from './hooks/useAuth';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Remove the cache used by the legacy hand-written service worker. The new
  // Workbox worker owns versioned precaches and removes its own obsolete ones.
  if ('caches' in window) {
    void caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('chavea-pwa-'))
            .map((key) => caches.delete(key)),
        ),
      )
      .catch((error) => console.warn('[pwa] legacy cache cleanup failed', error));
  }

  const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
  let updateSW: ReturnType<typeof registerSW> | undefined;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // autoUpdate normally activates immediately; this is a safety net for
      // browsers with stricter service-worker lifecycle behavior (notably iOS).
      void updateSW?.(true);
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = async () => {
        if (!navigator.onLine || registration.installing) return;

        try {
          const response = await fetch(swUrl, { cache: 'no-store' });
          if (response.ok) await registration.update();
        } catch (error) {
          console.warn('[pwa] update check failed', error);
        }
      };

      void checkForUpdate();
      window.setInterval(() => void checkForUpdate(), UPDATE_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });
    },
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error);
    },
  });
}
