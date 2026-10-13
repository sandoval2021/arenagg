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

export type AuthUser = {
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  role: 'USER' | 'ADMIN';
};

type Credentials = { email?: string; phone?: string; password: string };
type Registration = Credentials & { name: string };
type AuthSessionResponse = {
  user: AuthUser | null;
  rewards?: { dailyPackGranted?: boolean };
};

const AUTH_QUERY_KEY = ['auth', 'me'] as const;
const USER_SNAPSHOT_KEY = 'chaveaUserSnapshot';
const KNOWN_SESSION_KEY = 'chaveaHasSession';
const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);

function readSnapshot(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(USER_SNAPSHOT_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as Partial<AuthUser>;
    if (typeof user.id !== 'string' || typeof user.name !== 'string' ||
        (user.role !== 'USER' && user.role !== 'ADMIN')) return null;
    return {
      id: user.id, name: user.name, role: user.role,
      displayName: typeof user.displayName === 'string' ? user.displayName : null,
      avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : null,
      email: null, phone: null,
    };
  } catch { return null; }
}
function persistSnapshot(user: AuthUser): void {
  // Snapshot helps initial paint; server-side HttpOnly cookie alone authenticates.
  try {
    window.localStorage.setItem(KNOWN_SESSION_KEY, 'true');
    window.localStorage.setItem(USER_SNAPSHOT_KEY, JSON.stringify({
      id: user.id, name: user.name, role: user.role,
      displayName: user.displayName, avatarUrl: user.avatarUrl,
    }));
  } catch { /* restricted storage must not block login */ }
}
function clearSnapshot(): void {
  try {
    window.localStorage.removeItem(KNOWN_SESSION_KEY);
    window.localStorage.removeItem(USER_SNAPSHOT_KEY);
  } catch { /* best effort */ }
}
function unauthorized(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
async function loadSession(): Promise<AuthSessionResponse> {
  try {
    const response = await apiRequest<AuthSessionResponse>('/api/auth/me');
    if (response.user) persistSnapshot(response.user);
    return response;
  } catch (error) {
    if (!unauthorized(error)) throw error;
    clearSnapshot();
    return { user: null };
  }
}

function useAuthState() {
  const queryClient = useQueryClient();
  const [cachedUser, setCachedUser] = useState<AuthUser | null>(readSnapshot);
  const [hasPersistedSession, setHasPersistedSession] = useState(() => Boolean(readSnapshot()));
  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: loadSession,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: (count, error) => !unauthorized(error) && count < 2,
    retryDelay: attempt => Math.min(600 * 2 ** attempt, 2_000),
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!me.data) return;
    setCachedUser(me.data.user);
    setHasPersistedSession(Boolean(me.data.user));
    if (!me.data.user) clearSnapshot();
  }, [me.data]);

  const updateSession = (response: AuthSessionResponse & { user: AuthUser }) => {
    persistSnapshot(response.user);
    setCachedUser(response.user);
    setHasPersistedSession(true);
    queryClient.setQueryData(AUTH_QUERY_KEY, response);
  };

  const login = useMutation({
    mutationFn: (credentials: Credentials) => apiRequest<AuthSessionResponse & { user: AuthUser }>(
      '/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) },
    ),
    onSuccess: updateSession,
  });
  const register = useMutation({
    mutationFn: (registration: Registration) => apiRequest<AuthSessionResponse & { user: AuthUser }>(
      '/api/auth/register', { method: 'POST', body: JSON.stringify(registration) },
    ),
    onSuccess: updateSession,
  });
  const logout = useMutation({
    mutationFn: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      clearSnapshot();
      setCachedUser(null);
      setHasPersistedSession(false);
      queryClient.setQueryData(AUTH_QUERY_KEY, { user: null });
      queryClient.removeQueries({ queryKey: ['competitions'] });
      queryClient.removeQueries({ queryKey: ['default-shields'] });
      queryClient.removeQueries({ queryKey: ['owner', 'default-shields'] });
    },
  });
  const forceLoginRecovery = useCallback(() => {
    clearSnapshot();
    setCachedUser(null);
    setHasPersistedSession(false);
    queryClient.clear();
    window.location.replace('/login');
  }, [queryClient]);
  const isSessionVerified = Boolean(me.data?.user);
  const isBootstrapping = me.isPending && !me.isError;
  return {
    user: me.data?.user ?? cachedUser,
    isLoading: false,
    isBootstrapping,
    isSessionVerified,
    hasPersistedSession,
    hasBootstrapError: me.isError,
    bootstrapError: me.error,
    isAuthenticated: Boolean(me.data?.user ?? cachedUser),
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
  return <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-center text-sm font-black shadow-xl">🎁 Você ganhou 1 Pacotinho Diário!</div>;
}
export function AuthProvider({ children }: PropsWithChildren) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>
    <DailyPackToast granted={value.dailyRewardGranted} />
    {children}
  </AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
