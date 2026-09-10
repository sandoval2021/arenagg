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
  clearOAuthFragment,
  clearSupabaseSession,
  getSupabaseAccessToken,
  persistSupabaseSession,
  readOAuthSessionFromLocation,
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
  if (!response.ok || !body?.session || !body.user) throw new Error('AUTH_MIGRATION_FAILED');
  await persistSupabaseSession(body.session);
  return body;
}

async function loadPersistentSession(): Promise<AuthSessionResponse> {
  const oauthSession = readOAuthSessionFromLocation();
  if (oauthSession) {
    await persistSupabaseSession(oauthSession);
    clearOAuthFragment();
  }

  const token = await getSupabaseAccessToken();
  if (token) return requestSession();

  const migrated = await migrateLegacyCookie();
  if (migrated) return migrated;
  return { user: null, rewards: { dailyPackGranted: false } };
}

async function bootstrapPersistentSession(): Promise<AuthSessionResponse> {
  try {
    return await withTimeout(loadPersistentSession(), AUTH_BOOT_TIMEOUT_MS);
  } catch (error) {
    console.error('[auth] bootstrap failed; clearing local bearer session', {
      status: error instanceof ApiError ? error.status : undefined,
      code: error instanceof ApiError ? error.code : undefined,
      details: error instanceof ApiError ? error.details : undefined,
      reason: error instanceof Error ? error.message : String(error),
    });
    await clearSupabaseSession();
    return {
      user: null,
      rewards: { dailyPackGranted: false },
      bootstrapFailed: true,
    };
  }
}

async function persistLoginResponse<T extends AuthSessionResponse>(data: T): Promise<T> {
  if (!data.session?.accessToken) throw new Error('AUTH_SESSION_MISSING');
  await persistSupabaseSession(data.session);
  return data;
}

function useAuthState() {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: bootstrapPersistentSession,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  const login = useMutation({
    mutationFn: async (data: Credentials) => {
      try {
        const response = await apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return await persistLoginResponse(response);
      } catch (error) {
        console.error('[auth.login] failed', {
          identifierType: data.email ? 'email' : 'phone',
          status: error instanceof ApiError ? error.status : undefined,
          code: error instanceof ApiError ? error.code : undefined,
          details: error instanceof ApiError ? error.details : undefined,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
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
      queryClient.clear();
      queryClient.setQueryData(AUTH_QUERY_KEY, {
        user: null,
        rewards: { dailyPackGranted: false },
        bootstrapFailed: false,
      });
    },
  });

  const forceLoginRecovery = useCallback(() => {
    void clearSupabaseSession();
    queryClient.clear();
    if (window.location.pathname !== '/login') {
      window.location.replace('/login');
      return;
    }
    queryClient.setQueryData(AUTH_QUERY_KEY, {
      user: null,
      rewards: { dailyPackGranted: false },
      bootstrapFailed: false,
    });
  }, [queryClient]);

  const isBootstrapping = me.data === undefined && me.isPending;
  const bootstrapFailed = Boolean(me.data?.bootstrapFailed) || (me.data === undefined && me.isError);

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

  useEffect(() => {
    if (value.bootstrapFailed) value.forceLoginRecovery();
  }, [value.bootstrapFailed, value.forceLoginRecovery]);

  if (value.isBootstrapping) return <SessionBootScreen />;
  if (value.bootstrapFailed && window.location.pathname !== '/login') {
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
