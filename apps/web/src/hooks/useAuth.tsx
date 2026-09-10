import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../lib/api';

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
const USER_SNAPSHOT_KEY = 'chaveaUserSnapshot';

function readKnownSession(): boolean {
  try {
    return window.localStorage.getItem(KNOWN_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function readUserSnapshot(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(USER_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string' ||
      (parsed.role !== 'USER' && parsed.role !== 'ADMIN')
    ) {
      return null;
    }
    return {
      id: parsed.id,
      name: parsed.name,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : null,
      // Contact data is deliberately not persisted in the optimistic UI snapshot.
      email: null,
      phone: null,
      role: parsed.role,
    };
  } catch {
    return null;
  }
}

function persistSessionUser(user: AuthUser) {
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
    // Local snapshot is a performance hint only. The backend still validates auth.
  }
}

function clearPersistedSession() {
  try {
    window.localStorage.removeItem(KNOWN_SESSION_KEY);
    window.localStorage.removeItem(USER_SNAPSHOT_KEY);
  } catch {
    // Storage can be unavailable in restrictive browser modes.
  }
}

function isAuthorizationError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

async function requestSession(): Promise<AuthSessionResponse> {
  try {
    return await apiRequest<AuthSessionResponse>('/api/auth/me');
  } catch (error) {
    if (isAuthorizationError(error)) {
      clearPersistedSession();
      return { user: null, rewards: { dailyPackGranted: false } };
    }
    // Network/server failures must never turn an optimistic local session into
    // a forced logout. React Query will refresh again on reconnect.
    throw error;
  }
}

function useAuthState() {
  const queryClient = useQueryClient();
  const [hasKnownSession, setHasKnownSession] = useState<boolean>(() => readKnownSession());
  const [cachedUser, setCachedUser] = useState<AuthUser | null>(() =>
    readKnownSession() ? readUserSnapshot() : null,
  );

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: requestSession,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // Startup is never held hostage by retries. Reconnect/focus can refresh later.
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!me.data) return;
    if (me.data.user) {
      persistSessionUser(me.data.user);
      setCachedUser(me.data.user);
      setHasKnownSession(true);
      return;
    }
    clearPersistedSession();
    setCachedUser(null);
    setHasKnownSession(false);
  }, [me.data]);

  const rememberAuthenticatedUser = (data: AuthSessionResponse & { user: AuthUser }) => {
    persistSessionUser(data.user);
    setCachedUser(data.user);
    setHasKnownSession(true);
    queryClient.setQueryData(AUTH_QUERY_KEY, data);
  };

  const login = useMutation({
    mutationFn: (data: Credentials) =>
      apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: rememberAuthenticatedUser,
  });

  const register = useMutation({
    mutationFn: (data: Registration) =>
      apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: rememberAuthenticatedUser,
  });

  const logout = useMutation({
    mutationFn: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      clearPersistedSession();
      setCachedUser(null);
      setHasKnownSession(false);
      queryClient.setQueryData(AUTH_QUERY_KEY, { user: null });
      queryClient.removeQueries({ queryKey: ['competitions'] });
      queryClient.removeQueries({ queryKey: ['default-shields'] });
      queryClient.removeQueries({ queryKey: ['owner', 'default-shields'] });
    },
  });

  const liveUser = me.data?.user ?? null;
  const user = liveUser ?? cachedUser;
  const isBootstrapping = me.data === undefined && me.isPending;

  return {
    user,
    // Kept for compatibility with existing components; it no longer blocks the app shell.
    isLoading: false,
    isBootstrapping,
    hasKnownSession,
    hasBootstrapError: me.data === undefined && me.isError,
    bootstrapError: me.error,
    isAuthenticated: Boolean(user),
    dailyRewardGranted: Boolean(me.data?.rewards?.dailyPackGranted),
    login,
    register,
    logout,
    refresh: () => me.refetch(),
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
      🎁 Você ganhou 1 Pacote Diário de Cartas!
    </div>
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const value = useAuthState();

  // Zero-latency bootstrap: never replace the whole application with a network
  // validation screen. Auth is refreshed in the background while the cached
  // shell/user snapshot renders immediately.
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
