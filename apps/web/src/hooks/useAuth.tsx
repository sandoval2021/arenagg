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
  subscribeSupabaseAuthState,
  type BrowserSessionEnvelope,
} from '../lib/supabase-auth';

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
const KNOWN_SESSION_KEY = 'chaveaHasSession';
const USER_SNAPSHOT_KEY = 'chaveaUserSnapshot';
const AUTH_RECOVERY_DELAYS_MS = [250, 750, 1_500, 3_000, 5_000] as const;

function isPublicAuthPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';
}

function hasPersistedSessionSync(): boolean {
  try {
    if (window.localStorage.getItem(KNOWN_SESSION_KEY) === 'true') return true;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('sb-') && key.endsWith('-auth-token') && window.localStorage.getItem(key)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function readUserSnapshot(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(USER_SNAPSHOT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AuthUser>;
    if (
      typeof value.id !== 'string' ||
      typeof value.name !== 'string' ||
      (value.role !== 'USER' && value.role !== 'ADMIN')
    ) {
      return null;
    }
    return {
      id: value.id,
      name: value.name,
      displayName: typeof value.displayName === 'string' ? value.displayName : null,
      avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
      email: null,
      phone: null,
      role: value.role,
    };
  } catch {
    return null;
  }
}

function persistUserSnapshot(user: AuthUser): void {
  try {
    window.localStorage.setItem(KNOWN_SESSION_KEY, 'true');
    window.localStorage.setItem(
      USER_SNAPSHOT_KEY,
      JSON.stringify({
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
      }),
    );
  } catch {
    // The snapshot is only a paint optimization. Supabase remains auth source of truth.
  }
}

function clearUserSnapshot(): void {
  try {
    window.localStorage.removeItem(KNOWN_SESSION_KEY);
    window.localStorage.removeItem(USER_SNAPSHOT_KEY);
  } catch {
    // Ignore restricted storage modes.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isAuthorizationError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function isClientAuthError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error &&
    typeof error.status === 'number' && error.status >= 400 && error.status < 500;
}

async function requestSession(): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/auth/me');
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
  persistUserSnapshot(body.user);
  return body;
}

async function readStoredSessionWithGrace() {
  let session = await readPersistedSupabaseSession();
  if (session || !hasPersistedSessionSync()) return session;

  // iOS can briefly expose the PWA shell before storage/session hydration has
  // settled. Keep the app interactive and give persisted auth a bounded grace
  // window before treating an absent SDK session as a real sign-out.
  for (const delay of AUTH_RECOVERY_DELAYS_MS) {
    await sleep(delay);
    session = await readPersistedSupabaseSession();
    if (session) return session;
  }

  return null;
}

async function validateBearerSessionWithGrace(): Promise<AuthSessionResponse | null> {
  let lastAuthorizationError: unknown = null;

  for (let attempt = 0; attempt <= AUTH_RECOVERY_DELAYS_MS.length; attempt += 1) {
    try {
      return await requestSession();
    } catch (error) {
      if (!isAuthorizationError(error)) throw error;
      lastAuthorizationError = error;
    }

    try {
      const refreshed = await refreshSupabaseAccessToken();
      if (refreshed) {
        try {
          return await requestSession();
        } catch (error) {
          if (!isAuthorizationError(error)) throw error;
          lastAuthorizationError = error;
        }
      }
    } catch (refreshError) {
      // Connectivity/runtime failures are not logout signals. Bubble them so
      // cached user state remains mounted and React Query can retry later.
      if (!isClientAuthError(refreshError)) throw refreshError;
      lastAuthorizationError = refreshError;
    }

    if (attempt < AUTH_RECOVERY_DELAYS_MS.length) {
      await sleep(AUTH_RECOVERY_DELAYS_MS[attempt]);
    }
  }

  console.warn('[auth] bearer session remained unauthorized after recovery grace', lastAuthorizationError);
  return null;
}

async function loadPersistentSession(): Promise<AuthSessionResponse> {
  const hadPersistedSession = hasPersistedSessionSync();
  const storedSession = await readStoredSessionWithGrace();

  if (!storedSession) {
    const migrated = await migrateLegacyCookie();
    if (migrated) return migrated;

    setSupabaseAccessToken(null);
    if (hadPersistedSession) {
      // Only after the full storage grace window do we accept that the browser
      // truly lost the persisted Supabase session.
      await clearSupabaseSession();
      clearUserSnapshot();
    }
    return { user: null, rewards: { dailyPackGranted: false } };
  }

  setSupabaseAccessToken(storedSession.access_token);
  const validated = await validateBearerSessionWithGrace();
  if (validated) return validated;

  await clearSupabaseSession();
  clearUserSnapshot();
  return { user: null, rewards: { dailyPackGranted: false } };
}

async function persistLoginResponse<T extends AuthSessionResponse>(data: T): Promise<T> {
  if (!data.session) throw new Error('AUTH_SESSION_MISSING');
  const session = await persistSupabaseSession(data.session);
  setSupabaseAccessToken(session.access_token);
  if (data.user) persistUserSnapshot(data.user);
  return data;
}

function useAuthState() {
  const queryClient = useQueryClient();
  const isPublicAuthRoute = isPublicAuthPath(window.location.pathname);
  const [hasPersistedSession, setHasPersistedSession] = useState(() => hasPersistedSessionSync());
  const [cachedUser, setCachedUser] = useState<AuthUser | null>(() => readUserSnapshot());

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: loadPersistentSession,
    enabled: !isPublicAuthRoute,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: (failureCount, error) => !isAuthorizationError(error) && failureCount < 2,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 3_000),
    refetchOnWindowFocus: false,
    refetchOnMount: isPublicAuthRoute ? false : 'always',
    refetchOnReconnect: !isPublicAuthRoute,
  });

  useEffect(() => {
    if (!me.data) return;
    if (me.data.user) {
      persistUserSnapshot(me.data.user);
      setCachedUser(me.data.user);
      setHasPersistedSession(true);
      return;
    }
    clearUserSnapshot();
    setCachedUser(null);
    setHasPersistedSession(false);
  }, [me.data]);

  useEffect(() => subscribeSupabaseAuthState((event, session) => {
    setSupabaseAccessToken(session?.access_token ?? null);
    if (session) {
      setHasPersistedSession(true);
      return;
    }

    if (event === 'SIGNED_OUT') {
      // Supabase can transiently emit SIGNED_OUT while an iOS PWA is restoring
      // or refreshing tokens. Do not tear down the React user immediately.
      // Explicit logout has its own deterministic onSettled cleanup below;
      // unexpected sign-out signals are confirmed by the guarded /auth/me flow.
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY, refetchType: 'active' });
      }, 1_000);
    }
  }), [queryClient]);

  const login = useMutation({
    mutationFn: async (data: Credentials) => {
      const response = await apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return persistLoginResponse(response);
    },
    onSuccess: (data) => {
      persistUserSnapshot(data.user);
      setCachedUser(data.user);
      setHasPersistedSession(true);
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
      persistUserSnapshot(data.user);
      setCachedUser(data.user);
      setHasPersistedSession(true);
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
    onSettled: () => {
      clearUserSnapshot();
      setCachedUser(null);
      setHasPersistedSession(false);
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
      clearUserSnapshot();
      queryClient.clear();
      window.location.replace('/login');
    })();
  }, [queryClient]);

  const liveUser = me.data?.user ?? null;
  const user = liveUser ?? cachedUser;
  const isBootstrapping = !isPublicAuthRoute && me.data === undefined && me.isPending;
  const hasBootstrapError = !isPublicAuthRoute && me.data === undefined && me.isError;

  return {
    user,
    // Network/session validation runs in the background and never blocks paint.
    isLoading: false,
    isBootstrapping,
    hasPersistedSession,
    hasBootstrapError,
    bootstrapError: me.error,
    isAuthenticated: Boolean(user),
    dailyRewardGranted: Boolean(me.data?.rewards?.dailyPackGranted),
    login,
    register,
    logout,
    refresh: () => me.refetch(),
    forceLoginRecovery,
    googleLoginUrl: '/api/auth/google',
  };
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

  // Zero-latency bootstrap: Supabase/Bearer validation continues in background;
  // never replace the whole application with a network-dependent auth screen.
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
