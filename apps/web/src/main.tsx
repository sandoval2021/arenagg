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
