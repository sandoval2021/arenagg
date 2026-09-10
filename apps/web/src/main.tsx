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
  let reloadingForController = false;

  const getOrCreateRegistration = () =>
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      // Re-registering the same scope upgrades older installed PWAs to
      // updateViaCache=none, forcing WebKit to revalidate sw.js on the network.
      updateViaCache: 'none',
    });

  const checkForUpdate = async () => {
    if (!navigator.onLine || inFlight) return;

    const now = Date.now();
    if (now - lastCheckAt < 5_000) return;
    lastCheckAt = now;
    inFlight = true;

    try {
      const registration = await getOrCreateRegistration();
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

  // When a newly installed worker takes control, reload exactly once so the
  // current WebKit process also switches from the old JS bundle to the new one.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForController) return;
    reloadingForController = true;
    window.location.reload();
  });

  void checkForUpdate();
  window.addEventListener('online', checkForUpdate);
  window.addEventListener('pageshow', checkForUpdate);
  window.addEventListener('focus', checkForUpdate);
  document.addEventListener('visibilitychange', onVisibilityChange);

  // A long-running installed PWA should discover a deployment without needing
  // to be killed/reopened. Browsers throttle background timers, so only check
  // while visible and online.
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void checkForUpdate();
  }, 30_000);
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
