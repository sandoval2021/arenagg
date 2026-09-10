import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../lib/api';
import {
  clearSupabaseSession,
  clearSupabaseSessionSync,
  hydrateSupabaseAccessTokenSync,
  persistSupabaseSession,
  setSupabaseAccessToken,
  supabase,
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

function isPublicAuthPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';
}

async function persistLoginResponse<T extends AuthSessionResponse>(data: T): Promise<T> {
  if (!data.session) throw new Error('AUTH_SESSION_MISSING');
  const session = await persistSupabaseSession(data.session);
  setSupabaseAccessToken(session.access_token, session.expires_at ?? null);
  return data;
}

function useAuthState() {
  const queryClient = useQueryClient();
  const isPublicAuthRoute = isPublicAuthPath(window.location.pathname);

  // Zero-latency bootstrap: this reads only localStorage and hydrates the Bearer
  // token in memory synchronously. It performs no fetch and no GoTrue lock wait.
  const [knownSession, setKnownSession] = useState(hydrateSupabaseAccessTokenSync);

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => apiRequest<AuthSessionResponse>('/api/auth/me'),
    enabled: knownSession && !isPublicAuthRoute,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (me.data?.user) {
      setKnownSession(true);
      return;
    }

    if (me.data && !me.data.user) {
      clearSupabaseSessionSync();
      setKnownSession(false);
    }
  }, [me.data]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearSupabaseSessionSync();
      setKnownSession(false);
      queryClient.setQueryData(AUTH_QUERY_KEY, {
        user: null,
        rewards: { dailyPackGranted: false },
      } satisfies AuthSessionResponse);
    };

    window.addEventListener('chavea:unauthorized', onUnauthorized);
    return () => window.removeEventListener('chavea:unauthorized', onUnauthorized);
  }, [queryClient]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSupabaseAccessToken(session?.access_token ?? null, session?.expires_at ?? null);

      if (event === 'SIGNED_OUT') {
        clearSupabaseSessionSync();
        setKnownSession(false);
        queryClient.setQueryData(AUTH_QUERY_KEY, {
          user: null,
          rewards: { dailyPackGranted: false },
        } satisfies AuthSessionResponse);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (!session) return;
        setKnownSession(true);
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
      setKnownSession(true);
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
      setKnownSession(true);
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
      clearSupabaseSessionSync();
      setKnownSession(false);
      queryClient.setQueryData(AUTH_QUERY_KEY, {
        user: null,
        rewards: { dailyPackGranted: false },
      } satisfies AuthSessionResponse);
      queryClient.removeQueries({ queryKey: ['competitions'] });
      queryClient.removeQueries({ queryKey: ['default-shields'] });
      queryClient.removeQueries({ queryKey: ['owner', 'default-shields'] });
    },
  });

  const authoritativeLogout = Boolean(me.data && !me.data.user);
  const authorizationRejected = me.error instanceof ApiError && me.error.status === 401;
  const optimisticAuthenticated = knownSession && !authoritativeLogout && !authorizationRejected;

  return {
    user: me.data?.user ?? null,
    isLoading: false,
    isBootstrapping: false,
    isSessionRefreshing: knownSession && me.isFetching,
    isAuthenticated: Boolean(me.data?.user) || optimisticAuthenticated,
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
      🎁 Você ganhou 1 Pacotinho Diário por acessar hoje!
    </div>
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const value = useAuthState();

  // Never gate first paint on getSession(), /auth/me, a timer or a full-screen
  // loader. The persisted session only decides the shell; the API remains the
  // authority and a real 401 tears the optimistic session down immediately.
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
