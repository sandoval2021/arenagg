import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/brand/Logo';
import { GlobalLoader } from '../components/brand/GlobalLoader';

export type AuthUser = {
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  role: 'USER' | 'ADMIN';
};

type Credentials = {
  email?: string;
  phone?: string;
  password: string;
};

type Registration = Credentials & {
  name: string;
};

type PersistableSession = {
  access_token: string;
  refresh_token: string;
};

type AuthSessionResponse = {
  user: AuthUser | null;
  session?: PersistableSession;
  rewards?: { dailyPackGranted?: boolean };
};

type AuthContextValue = ReturnType<typeof useAuthState>;

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_QUERY_KEY = ['auth', 'me'] as const;

function isAuthorizationError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

async function persistServerSession(data: AuthSessionResponse): Promise<void> {
  if (!data.session?.access_token || !data.session.refresh_token) {
    throw new ApiError(401, 'SESSION_PERSIST_FAILED');
  }

  const { error } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (error) {
    console.error('[auth] Supabase local session persistence failed', error.message);
    throw new ApiError(401, 'SESSION_PERSIST_FAILED', { message: error.message });
  }
}

async function requestSession(): Promise<AuthSessionResponse> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ApiError(0, 'SESSION_RESTORE_FAILED', { message: error.message });
  if (!data.session?.access_token) {
    return { user: null, rewards: { dailyPackGranted: false } };
  }

  try {
    return await apiRequest<AuthSessionResponse>('/api/auth/me');
  } catch (requestError) {
    if (isAuthorizationError(requestError)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      return { user: null, rewards: { dailyPackGranted: false } };
    }
    throw requestError;
  }
}

function useAuthState() {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    // Supabase restores/refreshes the access + refresh token pair from browser
    // localStorage before the Worker validates the Bearer JWT via /auth/me.
    queryFn: requestSession,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: (failureCount, error) => !isAuthorizationError(error) && failureCount < 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2_000),
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        queryClient.setQueryData(AUTH_QUERY_KEY, { user: null, rewards: { dailyPackGranted: false } });
      }
      if (event === 'TOKEN_REFRESHED') {
        void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const login = useMutation({
    mutationFn: async (credentials: Credentials) => {
      const response = await apiRequest<AuthSessionResponse & { user: AuthUser; session: PersistableSession }>(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify(credentials) },
      );
      await persistServerSession(response);
      return response;
    },
    onSuccess: (data) => queryClient.setQueryData(AUTH_QUERY_KEY, data),
  });

  const register = useMutation({
    mutationFn: async (registration: Registration) => {
      const response = await apiRequest<AuthSessionResponse & { user: AuthUser; session: PersistableSession }>(
        '/api/auth/register',
        { method: 'POST', body: JSON.stringify(registration) },
      );
      await persistServerSession(response);
      return response;
    },
    onSuccess: (data) => queryClient.setQueryData(AUTH_QUERY_KEY, data),
  });

  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[auth] remote sign-out failed; clearing local session', error.message);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
    },
    onSettled: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, { user: null, rewards: { dailyPackGranted: false } });
      queryClient.removeQueries({ queryKey: ['competitions'] });
      queryClient.removeQueries({ queryKey: ['default-shields'] });
      queryClient.removeQueries({ queryKey: ['owner', 'default-shields'] });
      queryClient.removeQueries({ queryKey: ['ranking'] });
      queryClient.removeQueries({ queryKey: ['global-friendly-feed'] });
    },
  });

  const isBootstrapping = me.data === undefined && me.isPending;
  const hasBootstrapError = me.data === undefined && me.isError;

  return {
    user: me.data?.user ?? null,
    isLoading: isBootstrapping,
    isBootstrapping,
    hasBootstrapError,
    bootstrapError: me.error,
    isAuthenticated: Boolean(me.data?.user),
    dailyRewardGranted: Boolean(me.data?.rewards?.dailyPackGranted),
    login,
    register,
    logout,
    refresh: () => me.refetch(),
    googleLoginUrl: '',
  };
}

function SessionBootScreen() {
  return <GlobalLoader mode="screen" label="Validando sua sessão…" />;
}

function SessionRecoveryScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const networkFailure = error instanceof ApiError && error.status === 0;
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center"><Logo size="md" /></div>
        <h1 className="mt-7 text-xl font-black">
          {networkFailure ? 'Não foi possível conectar ao Chavea.' : 'Não foi possível validar sua sessão.'}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          {networkFailure
            ? 'Verifique sua conexão e tente novamente.'
            : 'O serviço de autenticação respondeu com erro. Sua sessão local foi preservada para nova tentativa.'}
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

function DailyPackToast({ granted }: { granted: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!granted) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [granted]);

  if (!visible) return null;
  return (
    <div
      className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-yellow-50 px-4 py-3 text-center text-sm font-black text-amber-950 shadow-2xl shadow-amber-200/60"
      role="status"
      aria-live="polite"
    >
      🎁 Você ganhou 1 Pacote Diário de Cartas!
    </div>
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const value = useAuthState();

  if (value.isBootstrapping) return <SessionBootScreen />;
  if (value.hasBootstrapError) {
    return <SessionRecoveryScreen error={value.bootstrapError} onRetry={() => void value.refresh()} />;
  }

  return (
    <AuthContext.Provider value={value}>
      <DailyPackToast granted={value.dailyRewardGranted} />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
