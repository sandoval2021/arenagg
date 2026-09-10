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
    // This is only a non-sensitive fast-start hint. The server session remains
    // the authority for every protected API operation.
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
      writeKnownSession(false);
      return { user: null, rewards: { dailyPackGranted: false } };
    }
    throw error;
  }
}

function useAuthState() {
  const queryClient = useQueryClient();
  // Synchronous localStorage read is intentional: it lets the PWA paint its
  // authenticated app shell immediately instead of waiting on a network round-trip.
  const [knownSession, setKnownSession] = useState(readKnownSession);

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: requestSession,
    enabled: knownSession,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (me.data?.user) {
      writeKnownSession(true);
      setKnownSession(true);
      return;
    }
    // A completed authenticated check with no user is authoritative. Network
    // failures do not land here and therefore never blank the app shell.
    if (me.data && !me.data.user) {
      writeKnownSession(false);
      setKnownSession(false);
    }
  }, [me.data]);

  const login = useMutation({
    mutationFn: (data: Credentials) =>
      apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      writeKnownSession(true);
      setKnownSession(true);
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
      setKnownSession(true);
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
    },
  });

  const logout = useMutation({
    mutationFn: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Logging out is local-first: even if the network fails, never leave the UI
      // pretending the user is still signed in.
      writeKnownSession(false);
      setKnownSession(false);
      queryClient.setQueryData(AUTH_QUERY_KEY, { user: null });
      queryClient.removeQueries({ queryKey: ['competitions'] });
      queryClient.removeQueries({ queryKey: ['default-shields'] });
      queryClient.removeQueries({ queryKey: ['owner', 'default-shields'] });
    },
  });

  const hasValidatedUser = Boolean(me.data?.user);
  const validationFinishedWithoutUser = Boolean(me.data && !me.data.user);
  const optimisticAuthenticated = knownSession && !validationFinishedWithoutUser;

  return {
    user: me.data?.user ?? null,
    // Never block the first paint on session I/O. Consumers can inspect
    // isSessionRefreshing for subtle non-blocking status if ever needed.
    isLoading: false,
    isBootstrapping: false,
    isSessionRefreshing: knownSession && me.isFetching,
    hasBootstrapError: false,
    bootstrapError: me.error,
    isAuthenticated: hasValidatedUser || optimisticAuthenticated,
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
