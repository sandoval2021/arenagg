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
      // Background refetches and query-key transitions must never blank the
      // current mobile screen. Keep the last successful payload interactive
      // until the replacement payload arrives.
      placeholderData: (previousData) => previousData,
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
