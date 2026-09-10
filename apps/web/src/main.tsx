import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { AuthProvider } from './hooks/useAuth';
import { GlobalActivityLoader } from './components/brand/GlobalActivityLoader';
import { PwaUpdatePrompt } from './components/pwa/PwaUpdatePrompt';
import { installImagePerformanceDefaults } from './lib/image-performance';
import { DEFAULT_STALE_TIME, QUERY_GC_TIME } from './lib/query-cache';
import './styles/globals.css';

installImagePerformanceDefaults();

function refreshServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => undefined);
}

// Never make an update check part of the first-paint dependency graph. Trigger
// it after the browser gets an idle slot and whenever connectivity returns.
const scheduleWorkerRefresh = () => {
  const idle = window.requestIdleCallback;
  if (typeof idle === 'function') {
    idle(refreshServiceWorker, { timeout: 2_000 });
    return;
  }
  globalThis.setTimeout(refreshServiceWorker, 250);
};
scheduleWorkerRefresh();
window.addEventListener('online', refreshServiceWorker, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshServiceWorker();
});

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
