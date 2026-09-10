import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../lib/api';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import {
  clearSupabaseSession,
  clearSupabaseSessionStorage,
  persistSupabaseSession,
  readPersistedSupabaseSession,
  signInWithSupabasePassword,
  signUpWithSupabasePassword,
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
const AUTH_BOOT_TIMEOUT_MS = 5_000;
const USER_SNAPSHOT_KEY = 'chaveaUserSnapshot';
const KNOWN_SESSION_KEY = 'chaveaHasSession';

function isPublicAuthPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';
}

function clearUserSnapshot(): void {
  try {
    window.localStorage.removeItem(USER_SNAPSHOT_KEY);
    window.localStorage.removeItem(KNOWN_SESSION_KEY);
  } catch {
    // Supabase session storage is cleared separately.
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
    // Optional paint cache only. It is never accepted as proof of authentication.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(code)), ms);
    promise.then(
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

function supabaseStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null;
  return typeof error.status === 'number' ? error.status : null;
}

function supabaseMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

function shouldTryLegacyBridge(error: unknown): boolean {
  const status = supabaseStatus(error);
  const message = supabaseMessage(error).toLowerCase();
  return status === 400 || status === 401 || message.includes('invalid login credentials');
}

function loginApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const status = supabaseStatus(error);
  const message = supabaseMessage(error);
  if (status === 400 || status === 401) {
    return new ApiError(401, 'INVALID_CREDENTIALS', { message });
  }
  return new ApiError(0, 'AUTH_PROVIDER_ERROR', { message });
}

function registrationApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const status = supabaseStatus(error);
  const message = supabaseMessage(error);
  const normalized = message.toLowerCase();
  if (status === 422 || normalized.includes('already registered') || normalized.includes('already been registered')) {
    return new ApiError(409, 'ACCOUNT_EXISTS', { message });
  }
  if (status && status >= 400 && status < 500) {
    return new ApiError(status, 'INVALID_INPUT', { message });
  }
  return new ApiError(0, 'AUTH_PROVIDER_ERROR', { message });
}

async function requestInternalSession(): Promise<AuthSessionResponse & { user: AuthUser }> {
  const response = await apiRequest<AuthSessionResponse>('/api/auth/me');
  if (!response.user) throw new ApiError(401, 'UNAUTHORIZED');
  return response as AuthSessionResponse & { user: AuthUser };
}

async function legacyPasswordBridge(data: Credentials): Promise<AuthSessionResponse & { user: AuthUser }> {
  const response = await apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.session) throw new ApiError(503, 'AUTH_SESSION_ISSUE_FAILED');
  await persistSupabaseSession(response.session);
  // Prove that the newly persisted Supabase JWT is accepted by the Worker.
  return requestInternalSession();
}

function useAuthState() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dailyRewardGranted, setDailyRewardGranted] = useState(false);
  const redirectingRef = useRef(false);

  const resetLocalAuth = useCallback(() => {
    clearSupabaseSessionStorage();
    clearUserSnapshot();
    setUser(null);
    setDailyRewardGranted(false);
  }, []);

  const redirectToLogin = useCallback(() => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    resetLocalAuth();
    queryClient.clear();
    setIsLoading(false);
    if (!isPublicAuthPath(window.location.pathname)) {
      window.location.replace('/login');
    } else {
      redirectingRef.current = false;
    }
  }, [queryClient, resetLocalAuth]);

  const bootstrap = useCallback(async () => {
    const publicRoute = isPublicAuthPath(window.location.pathname);
    setIsLoading(true);
    try {
      const result = await withTimeout(
        (async () => {
          const session = await readPersistedSupabaseSession();
          if (!session) return null;
          return requestInternalSession();
        })(),
        AUTH_BOOT_TIMEOUT_MS,
        'AUTH_BOOT_TIMEOUT',
      );

      if (!result) {
        resetLocalAuth();
        setIsLoading(false);
        return;
      }

      persistUserSnapshot(result.user);
      setUser(result.user);
      setDailyRewardGranted(Boolean(result.rewards?.dailyPackGranted));
      setIsLoading(false);
    } catch (error) {
      console.error('[auth] bootstrap failed; clearing local session', {
        message: error instanceof Error ? error.message : String(error),
      });
      resetLocalAuth();
      queryClient.clear();
      setIsLoading(false);
      if (!publicRoute) redirectToLogin();
    }
  }, [queryClient, redirectToLogin, resetLocalAuth]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    try {
      return subscribeSupabaseAuthState((event) => {
        if (event !== 'SIGNED_OUT') return;
        resetLocalAuth();
        queryClient.clear();
        if (!isPublicAuthPath(window.location.pathname)) redirectToLogin();
      });
    } catch (error) {
      console.error('[auth] Supabase auth-state listener failed', error);
      return undefined;
    }
  }, [queryClient, redirectToLogin, resetLocalAuth]);

  const login = useMutation({
    mutationFn: async (data: Credentials) => {
      try {
        await withTimeout(
          signInWithSupabasePassword(data),
          AUTH_BOOT_TIMEOUT_MS,
          'AUTH_LOGIN_TIMEOUT',
        );
        return await withTimeout(requestInternalSession(), AUTH_BOOT_TIMEOUT_MS, 'AUTH_PROFILE_TIMEOUT');
      } catch (error) {
        if (!shouldTryLegacyBridge(error)) throw loginApiError(error);
        try {
          return await withTimeout(legacyPasswordBridge(data), AUTH_BOOT_TIMEOUT_MS, 'AUTH_LEGACY_BRIDGE_TIMEOUT');
        } catch (legacyError) {
          throw loginApiError(legacyError);
        }
      }
    },
    onSuccess: (data) => {
      redirectingRef.current = false;
      persistUserSnapshot(data.user);
      setUser(data.user);
      setDailyRewardGranted(Boolean(data.rewards?.dailyPackGranted));
      queryClient.setQueryData(['auth', 'me'], data);
    },
  });

  const register = useMutation({
    mutationFn: async (data: Registration) => {
      try {
        const result = await withTimeout(
          signUpWithSupabasePassword(data),
          AUTH_BOOT_TIMEOUT_MS,
          'AUTH_REGISTER_TIMEOUT',
        );
        if (!result.session) {
          throw new ApiError(202, 'EMAIL_CONFIRMATION_REQUIRED', {
            message: 'Confirme seu e-mail ou telefone para concluir o cadastro.',
          });
        }
        return await withTimeout(requestInternalSession(), AUTH_BOOT_TIMEOUT_MS, 'AUTH_PROFILE_TIMEOUT');
      } catch (error) {
        throw registrationApiError(error);
      }
    },
    onSuccess: (data) => {
      redirectingRef.current = false;
      persistUserSnapshot(data.user);
      setUser(data.user);
      setDailyRewardGranted(Boolean(data.rewards?.dailyPackGranted));
      queryClient.setQueryData(['auth', 'me'], data);
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest<void>('/api/auth/logout', { method: 'POST' });
      } catch (error) {
        console.warn('[auth] remote logout failed; local session will still be cleared', error);
      } finally {
        await clearSupabaseSession();
      }
    },
    onSettled: () => {
      resetLocalAuth();
      queryClient.clear();
      if (window.location.pathname !== '/login') window.location.replace('/login');
    },
  });

  return {
    user,
    isLoading,
    isBootstrapping: isLoading,
    hasPersistedSession: Boolean(user),
    hasBootstrapError: false,
    bootstrapError: null,
    isAuthenticated: Boolean(user),
    dailyRewardGranted,
    login,
    register,
    logout,
    refresh: bootstrap,
    forceLoginRecovery: redirectToLogin,
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

  if (value.isLoading && !isPublicAuthPath(window.location.pathname)) {
    return <GlobalLoader mode="screen" label="Restaurando sua sessão…" />;
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
