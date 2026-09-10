import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../lib/api';
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

type AuthSessionResponse = {
  user: AuthUser | null;
  rewards?: { dailyPackGranted?: boolean };
};

type AuthContextValue = ReturnType<typeof useAuthState>;

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_QUERY_KEY = ['auth', 'me'] as const;
const KNOWN_SESSION_KEY = 'chaveaHasSession';

function readKnownSession(): boolean {
  try {
    return window.localStorage.getItem(KNOWN_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeKnownSession(value: boolean) {
  try {
    if (value) window.localStorage.setItem(KNOWN_SESSION_KEY, 'true');
    else window.localStorage.removeItem(KNOWN_SESSION_KEY);
  } catch {
    // Non-sensitive hint only; HttpOnly cookie remains the source of truth.
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function isAuthorizationError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

async function requestSession(): Promise<AuthSessionResponse> {
  try {
    return await apiRequest<AuthSessionResponse>('/api/auth/me');
  } catch (error) {
    // 401/403 are authorization outcomes, not connectivity failures. Clear only
    // the non-sensitive session hint and let the router show the login flow.
    if (isAuthorizationError(error)) {
      writeKnownSession(false);
      return { user: null, rewards: { dailyPackGranted: false } };
    }
    throw error;
  }
}

async function loadSessionWithPwaGrace(): Promise<AuthSessionResponse> {
  const first = await requestSession();
  if (first.user) {
    writeKnownSession(true);
    return first;
  }

  // iOS/Android standalone PWAs can resume before persisted cookie storage is
  // fully hydrated. A tiny bounded retry avoids ejecting a known signed-in user
  // during that window. No credential/token is ever stored in localStorage.
  if (!readKnownSession()) return first;

  const delays = [250, 750, 1500, 2500] as const;
  let latest = first;
  for (const delay of delays) {
    await sleep(delay);
    latest = await requestSession();
    if (latest.user) {
      writeKnownSession(true);
      return latest;
    }
  }
  return latest;
}

function useAuthState() {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    // Source of truth after every hard refresh/PWA reopen: secure HttpOnly
    // chavea_session cookie validated against the persistent Session table.
    queryFn: loadSessionWithPwaGrace,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: (failureCount, error) => !isAuthorizationError(error) && failureCount < 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2_000),
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  const login = useMutation({
    mutationFn: (data: Credentials) =>
      apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      writeKnownSession(true);
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
    },
  });

  const register = useMutation({
    mutationFn: (data: Registration) =>
      apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      writeKnownSession(true);
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
    },
  });

  const logout = useMutation({
    mutationFn: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      writeKnownSession(false);
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
    bootstrapError: me.error,
    isAuthenticated: Boolean(me.data?.user),
    dailyRewardGranted: Boolean(me.data?.rewards?.dailyPackGranted),
    login,
    register,
    logout,
    refresh: () => me.refetch(),
    googleLoginUrl: '/api/auth/google',
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
            : 'O serviço de autenticação respondeu com erro. Sua conta não foi marcada como desconectada.'}
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

  // Never mount the router until the initial persistent session check (including
  // the bounded PWA hydration grace) has completed.
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
