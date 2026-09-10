import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { AuthProvider } from './hooks/useAuth';
import { GlobalActivityLoader } from './components/brand/GlobalActivityLoader';
import { PwaUpdatePrompt } from './components/pwa/PwaUpdatePrompt';
import { DEFAULT_STALE_TIME, QUERY_GC_TIME } from './lib/query-cache';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME,
      gcTime: QUERY_GC_TIME,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

function installSilentPwaUpdateChecks() {
  if (!('serviceWorker' in navigator)) return;

  let lastCheckAt = 0;
  let inFlight = false;

  const checkForUpdate = async () => {
    if (!navigator.onLine || inFlight) return;

    const now = Date.now();
    if (now - lastCheckAt < 15_000) return;
    lastCheckAt = now;
    inFlight = true;

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    } catch (error) {
      console.warn('[pwa] silent update check failed', error);
    } finally {
      inFlight = false;
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  };

  // Do not await any of these checks: rendering must never depend on SW update
  // I/O. They only force the browser to ask for a newer sw.js when connectivity
  // is available or the standalone PWA returns to the foreground.
  void checkForUpdate();
  window.addEventListener('online', checkForUpdate);
  window.addEventListener('pageshow', checkForUpdate);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

installSilentPwaUpdateChecks();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <GlobalActivityLoader />
      <PwaUpdatePrompt />
    </QueryClientProvider>
  </React.StrictMode>,
);
