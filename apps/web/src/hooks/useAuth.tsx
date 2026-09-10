import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../lib/api';
import {
  clearSupabaseSession,
  persistSupabaseSession,
  readPersistedSupabaseSession,
  refreshSupabaseAccessToken,
  setSupabaseAccessToken,
  supabase,
  type BrowserSessionEnvelope,
} from '../lib/supabase-auth';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import { Logo } from '../components/brand/Logo';

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
  session?: BrowserSessionEnvelope;
  rewards?: { dailyPackGranted?: boolean };
};

type AuthContextValue = ReturnType<typeof useAuthState>;

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_QUERY_KEY = ['auth', 'me'] as const;
const AUTH_BOOT_TIMEOUT_MS = 8_000;
const AUTH_ME_TIMEOUT_MS = 7_000;

function isPublicAuthPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new ApiError(0, 'AUTH_BOOT_TIMEOUT')), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isAuthorizationError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function isClientAuthError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error &&
    typeof error.status === 'number' && error.status >= 400 && error.status < 500;
}

async function requestSession(): Promise<AuthSessionResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AUTH_ME_TIMEOUT_MS);
  try {
    return await apiRequest<AuthSessionResponse>('/api/auth/me', { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function migrateLegacyCookie(): Promise<AuthSessionResponse | null> {
  let response: Response;
  try {
    response = await fetch('/api/auth/migrate-cookie', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return null;
  }

  if (response.status === 401) return null;
  const body = (await response.json().catch(() => null)) as AuthSessionResponse | null;
  if (!response.ok || !body?.session || !body.user) {
    throw new ApiError(response.status, 'AUTH_MIGRATION_FAILED', body);
  }

  const session = await persistSupabaseSession(body.session);
  setSupabaseAccessToken(session.access_token);
  return body;
}

async function loadPersistentSession(): Promise<AuthSessionResponse> {
  // Supabase Auth owns persistence. getSession() restores the access/refresh
  // token pair from localStorage before the protected router is mounted.
  const storedSession = await readPersistedSupabaseSession();

  if (!storedSession) {
    // One-time compatibility bridge for people who still have the legacy
    // HttpOnly cookie from a previous Chavea release.
    const migrated = await migrateLegacyCookie();
    if (migrated) return migrated;
    setSupabaseAccessToken(null);
    return { user: null, rewards: { dailyPackGranted: false } };
  }

  try {
    return await requestSession();
  } catch (error) {
    if (!isAuthorizationError(error)) throw error;

    // A PWA can resume with an expired access token after being backgrounded.
    // Refresh once from the persisted Supabase refresh token, then retry /me.
    try {
      const refreshed = await refreshSupabaseAccessToken();
      if (refreshed) return await requestSession();
    } catch (refreshError) {
      // Network/auth-server failures must NOT erase a valid persisted session.
      // Only a definite 4xx from Supabase means the refresh token is invalid.
      if (!isClientAuthError(refreshError)) throw refreshError;
    }

    await clearSupabaseSession();
    return { user: null, rewards: { dailyPackGranted: false } };
  }
}

async function bootstrapPersistentSession(): Promise<AuthSessionResponse> {
  return withTimeout(loadPersistentSession(), AUTH_BOOT_TIMEOUT_MS);
}

async function persistLoginResponse<T extends AuthSessionResponse>(data: T): Promise<T> {
  if (!data.session) throw new Error('AUTH_SESSION_MISSING');
  const session = await persistSupabaseSession(data.session);
  setSupabaseAccessToken(session.access_token);
  return data;
}

function useAuthState() {
  const queryClient = useQueryClient();
  const isPublicAuthRoute = isPublicAuthPath(window.location.pathname);

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: bootstrapPersistentSession,
    enabled: !isPublicAuthRoute,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: !isPublicAuthRoute,
    refetchOnMount: isPublicAuthRoute ? false : 'always',
    refetchOnReconnect: !isPublicAuthRoute,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSupabaseAccessToken(session?.access_token ?? null);

      if (event === 'SIGNED_OUT') {
        queryClient.setQueryData(AUTH_QUERY_KEY, {
          user: null,
          rewards: { dailyPackGranted: false },
        });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const login = useMutation({
    mutationFn: async (data: Credentials) => {
      const response = await apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return persistLoginResponse(response);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
    },
  });

  const register = useMutation({
    mutationFn: async (data: Registration) => {
      const response = await apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return persistLoginResponse(response);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest<void>('/api/auth/logout', { method: 'POST' });
      } finally {
        await clearSupabaseSession();
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, {
        user: null,
        rewards: { dailyPackGranted: false },
      });
      queryClient.removeQueries({ queryKey: ['competitions'] });
      queryClient.removeQueries({ queryKey: ['default-shields'] });
      queryClient.removeQueries({ queryKey: ['owner', 'default-shields'] });
    },
  });

  const forceLoginRecovery = useCallback(() => {
    void (async () => {
      await clearSupabaseSession();
      queryClient.clear();
      window.location.replace('/login');
    })();
  }, [queryClient]);

  const isBootstrapping = !isPublicAuthRoute && me.data === undefined && me.isPending;
  const hasBootstrapError = !isPublicAuthRoute && me.data === undefined && me.isError;

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
    forceLoginRecovery,
    googleLoginUrl: '/api/auth/google',
  };
}

function SessionBootScreen() {
  return <GlobalLoader mode="screen" label="Restaurando sua sessão…" />;
}

function SessionRecoveryScreen({
  error,
  onRetry,
  onSignInAgain,
}: {
  error: unknown;
  onRetry: () => void;
  onSignInAgain: () => void;
}) {
  const networkFailure = error instanceof ApiError && error.status === 0;
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center"><Logo size="md" /></div>
        <h1 className="mt-7 text-xl font-black">
          {networkFailure ? 'Não foi possível conectar ao Chavea.' : 'Não foi possível validar sua sessão.'}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Sua sessão salva no aparelho foi preservada. Tente novamente quando a conexão estiver estável.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-12 w-full rounded-2xl bg-[#073B8C] px-4 text-sm font-black text-white shadow-md"
        >
          Tentar novamente
        </button>
        <button
          type="button"
          onClick={onSignInAgain}
          className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600"
        >
          Sair desta sessão e entrar novamente
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
      🎁 Você ganhou 1 Pacotinho Diário por acessar hoje!
    </div>
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const value = useAuthState();
  const isPublicAuthRoute = isPublicAuthPath(window.location.pathname);

  if (!isPublicAuthRoute && value.isBootstrapping) return <SessionBootScreen />;
  if (!isPublicAuthRoute && value.hasBootstrapError) {
    return (
      <SessionRecoveryScreen
        error={value.bootstrapError}
        onRetry={() => void value.refresh()}
        onSignInAgain={value.forceLoginRecovery}
      />
    );
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
