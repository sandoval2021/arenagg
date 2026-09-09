import { createContext, useContext, type PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL, apiRequest } from '../lib/api';
import { Logo } from '../components/brand/Logo';
import { GlobalLoader } from '../components/brand/GlobalLoader';

export type AuthUser = {
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
};

type Credentials = {
  email?: string;
  phone?: string;
  password: string;
};

type Registration = Credentials & {
  name: string;
};

type AuthContextValue = ReturnType<typeof useAuthState>;

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_QUERY_KEY = ['auth', 'me'] as const;

function useAuthState() {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    // This is the source of truth after every hard refresh/F5. No auth token is
    // stored in localStorage/sessionStorage: the browser sends only the secure
    // HttpOnly chavea_session cookie and the API validates it against Session.
    queryFn: () => apiRequest<{ user: AuthUser | null }>('/api/auth/me'),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2_000),
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  const login = useMutation({
    mutationFn: (data: Credentials) =>
      apiRequest<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
    },
  });

  const register = useMutation({
    mutationFn: (data: Registration) =>
      apiRequest<{ user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
    },
  });

  const logout = useMutation({
    mutationFn: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, { user: null });
      queryClient.removeQueries({ queryKey: ['competitions'] });
      queryClient.removeQueries({ queryKey: ['default-shields'] });
      queryClient.removeQueries({ queryKey: ['owner', 'default-shields'] });
    },
  });

  const isBootstrapping = me.data === undefined && me.isPending;
  const hasBootstrapError = me.data === undefined && me.isError;

  return {
    user: me.data?.user ?? null,
    isLoading: isBootstrapping,
    isBootstrapping,
    hasBootstrapError,
    isAuthenticated: Boolean(me.data?.user),
    login,
    register,
    logout,
    refresh: () => me.refetch(),
    googleLoginUrl: `${API_URL}/api/auth/google`,
  };
}

function SessionBootScreen() {
  return <GlobalLoader mode="screen" label="Validando sua sessão…" />;
}

function SessionRecoveryScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center"><Logo size="md" /></div>
        <h1 className="mt-7 text-xl font-black">Não foi possível validar sua sessão.</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Sua conta não foi desconectada. Verifique a conexão e tente novamente.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-12 w-full rounded-2xl bg-[#073B8C] px-4 text-sm font-black text-white shadow-md"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const value = useAuthState();

  // Do not mount the router until /api/auth/me resolves. This prevents a hard
  // refresh from briefly seeing user=null and redirecting to /login.
  if (value.isBootstrapping) return <SessionBootScreen />;
  if (value.hasBootstrapError) return <SessionRecoveryScreen onRetry={() => void value.refresh()} />;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
