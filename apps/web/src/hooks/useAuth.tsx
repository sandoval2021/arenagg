import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import {
  clearSupabaseSession,
  persistSupabaseSession,
  setSupabaseAccessToken,
  supabase,
  suspendSupabasePersistence,
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
  bootstrapFailed?: boolean;
};

type AuthContextValue = ReturnType<typeof useAuthState>;

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_QUERY_KEY = ['auth', 'me'] as const;
const AUTH_BOOT_TIMEOUT_MS = 5_000;
const AUTH_ME_TIMEOUT_MS = 4_500;

function isPublicAuthPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';
}

function hardClearBrowserAuth() {
  // Freeze GoTrue persistence before clearing storage. This prevents a stale
  // refresh promise from re-populating localStorage after the recovery redirect.
  suspendSupabasePersistence();
  try {
    window.localStorage.clear();
  } catch {
    // Safari private/managed modes can reject storage access. The redirect to
    // /login still provides a deterministic escape route.
  }
  try {
    window.sessionStorage.clear();
  } catch {
    // Best effort only. No credential is allowed to keep the recovery route blocked.
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('AUTH_BOOT_TIMEOUT')), timeoutMs);
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
  if (!response.ok || !body?.session || !body.user) throw new Error('AUTH_MIGRATION_FAILED');

  await persistSupabaseSession(body.session);
  setSupabaseAccessToken(body.session.accessToken);
  return body;
}

async function loadPersistentSession(): Promise<AuthSessionResponse> {
  // This is the only getSession() on the critical bootstrap path. It is bounded
  // by AUTH_BOOT_TIMEOUT_MS, and every later API call reads the cached Bearer
  // token instead of entering GoTrue's storage/Web Locks machinery again.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  if (data.session) {
    setSupabaseAccessToken(data.session.access_token);
    return requestSession();
  }

  const migrated = await migrateLegacyCookie();
  if (migrated) return migrated;
  setSupabaseAccessToken(null);
  return { user: null, rewards: { dailyPackGranted: false } };
}

async function bootstrapPersistentSession(): Promise<AuthSessionResponse> {
  try {
    return await withTimeout(loadPersistentSession(), AUTH_BOOT_TIMEOUT_MS);
  } catch (error) {
    console.error('[auth] bootstrap failed; forcing clean login', {
      reason: error instanceof Error ? error.message : String(error),
    });
    hardClearBrowserAuth();
    if (window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
    return {
      user: null,
      rewards: { dailyPackGranted: false },
      bootstrapFailed: true,
    };
  }
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
    staleTime: 5 * 60_000,
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
          bootstrapFailed: false,
        });
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (!isPublicAuthPath(window.location.pathname)) {
          void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
        }
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
      queryClient.setQueryData(AUTH_QUERY_KEY, { ...data, bootstrapFailed: false });
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
      queryClient.setQueryData(AUTH_QUERY_KEY, { ...data, bootstrapFailed: false });
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
        bootstrapFailed: false,
      });
      queryClient.removeQueries({ queryKey: ['competitions'] });
      queryClient.removeQueries({ queryKey: ['default-shields'] });
      queryClient.removeQueries({ queryKey: ['owner', 'default-shields'] });
    },
  });

  const forceLoginRecovery = useCallback(() => {
    hardClearBrowserAuth();
    void queryClient.cancelQueries();
    queryClient.clear();

    if (window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
  }, [queryClient]);

  const isBootstrapping = !isPublicAuthRoute && me.data === undefined && me.isPending;
  const bootstrapFailed =
    !isPublicAuthRoute && (Boolean(me.data?.bootstrapFailed) || (me.data === undefined && me.isError));

  return {
    user: me.data?.user ?? null,
    isLoading: isBootstrapping,
    isBootstrapping,
    bootstrapFailed,
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

  // Independent watchdog: even if GoTrue leaves a promise permanently pending
  // on iOS, React never gets to keep the user on a white/loading screen forever.
  useEffect(() => {
    if (isPublicAuthRoute || !value.isBootstrapping) return;
    const watchdog = window.setTimeout(() => value.forceLoginRecovery(), AUTH_BOOT_TIMEOUT_MS);
    return () => window.clearTimeout(watchdog);
  }, [isPublicAuthRoute, value.isBootstrapping, value.forceLoginRecovery]);

  useEffect(() => {
    if (!isPublicAuthRoute && value.bootstrapFailed) value.forceLoginRecovery();
  }, [isPublicAuthRoute, value.bootstrapFailed, value.forceLoginRecovery]);

  if (!isPublicAuthRoute && value.isBootstrapping) return <SessionBootScreen />;

  if (!isPublicAuthRoute && value.bootstrapFailed) {
    return <GlobalLoader mode="screen" label="Abrindo login…" />;
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
