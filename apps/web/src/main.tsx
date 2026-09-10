import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { AuthProvider } from './hooks/useAuth';
import { GlobalActivityLoader } from './components/brand/GlobalActivityLoader';
import { PwaUpdatePrompt } from './components/pwa/PwaUpdatePrompt';
import { hydrateSupabaseAccessTokenSync } from './lib/supabase-auth';
import { installImagePerformanceDefaults } from './lib/image-performance';
import { DEFAULT_STALE_TIME, QUERY_GC_TIME } from './lib/query-cache';
import './styles/globals.css';

// Stable entry-level deployment signature. Route code-splitting moves Landing
// copy into async chunks, so production verification must not depend on an
// eagerly imported page. These data attributes also make field diagnostics
// possible without loading any additional module.
document.documentElement.dataset.chaveaProduct = 'O melhor gerenciador de campeonatos de EA FC e e-Sports!';
document.documentElement.dataset.chaveaApi = import.meta.env.VITE_API_URL?.trim() ?? '';

// Network-free boot work only. Protected queries can attach the persisted
// Bearer token on the first frame without waiting for Supabase getSession().
hydrateSupabaseAccessTokenSync();
installImagePerformanceDefaults();

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

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForController) return;
    reloadingForController = true;
    window.location.reload();
  });

  window.addEventListener('online', checkForUpdate, { passive: true });
  window.addEventListener('pageshow', checkForUpdate, { passive: true });
  window.addEventListener('focus', checkForUpdate, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void checkForUpdate();
  }, 30_000);

  // Update discovery must never compete with the first mobile paint.
  const idle = window.requestIdleCallback;
  if (typeof idle === 'function') idle(() => void checkForUpdate(), { timeout: 2_000 });
  else globalThis.setTimeout(() => void checkForUpdate(), 250);
}

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

installSilentPwaUpdateChecks();
