import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../lib/api';
import {
  clearSupabaseSession,
  persistSupabaseSession,
  supabase,
  type BrowserSessionEnvelope,
} from '../lib/supabase-auth';
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
  session?: BrowserSessionEnvelope;
  rewards?: { dailyPackGranted?: boolean };
};

type AuthContextValue = ReturnType<typeof useAuthState>;

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_QUERY_KEY = ['auth', 'me'] as const;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 5_000;

function isAuthorizationError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function withBootstrapTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new ApiError(0, 'AUTH_BOOTSTRAP_TIMEOUT'));
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    operation.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function requestSession(): Promise<AuthSessionResponse> {
  try {
    return await apiRequest<AuthSessionResponse>('/api/auth/me');
  } catch (error) {
    if (isAuthorizationError(error)) {
      await clearSupabaseSession();
      return { user: null, rewards: { dailyPackGranted: false } };
    }
    throw error;
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
    throw new ApiError(response.status, 'AUTH_MIGRATION_FAILED', body ?? undefined);
  }

  await persistSupabaseSession(body.session);
  return body;
}

async function loadPersistentSession(): Promise<AuthSessionResponse> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    await clearSupabaseSession();
  }

  if (data.session) {
    return requestSession();
  }

  // One-time bridge from the old HttpOnly-cookie release. If iOS already
  // deleted that cookie, the user signs in once and the new Supabase refresh
  // token is persisted in localStorage from then on.
  const migrated = await migrateLegacyCookie();
  if (migrated) return migrated;
  return { user: null, rewards: { dailyPackGranted: false } };
}

async function persistLoginResponse<T extends AuthSessionResponse>(data: T): Promise<T> {
  if (!data.session) throw new Error('AUTH_SESSION_MISSING');
  await persistSupabaseSession(data.session);
  return data;
}

function useAuthState() {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    // The entire bootstrap has a hard 5s deadline. A broken token refresh or
    // auth proxy can never keep the standalone PWA stuck on a loading screen.
    queryFn: () => withBootstrapTimeout(loadPersistentSession()),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        queryClient.setQueryData(AUTH_QUERY_KEY, { user: null, rewards: { dailyPackGranted: false } });
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
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
      queryClient.setQueryData(AUTH_QUERY_KEY, { user: null, rewards: { dailyPackGranted: false } });
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

function SessionBootScreen({ label = 'Restaurando sua sessão…' }: { label?: string }) {
  return <GlobalLoader mode="screen" label={label} />;
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
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!value.hasBootstrapError) return;

    // Fail open to the login route instead of trapping the PWA in a recovery
    // dead-end. Clear all browser-persisted state synchronously first so a
    // corrupt Supabase refresh token cannot immediately recreate the loop.
    try {
      window.localStorage.clear();
    } catch {
      // Storage can be unavailable in hardened/private browser modes.
    }

    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    queryClient.setQueryData(AUTH_QUERY_KEY, {
      user: null,
      rewards: { dailyPackGranted: false },
    });
    void clearSupabaseSession();

    if (window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
  }, [queryClient, value.hasBootstrapError]);

  if (value.isBootstrapping) return <SessionBootScreen />;
  if (value.hasBootstrapError) return <SessionBootScreen label="Voltando para o login…" />;

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
