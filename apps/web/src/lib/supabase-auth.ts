import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
  type User as SupabaseAuthUser,
} from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

let client: SupabaseClient | null = null;
let refreshInFlight: Promise<Session | null> | null = null;

export type BrowserSessionEnvelope = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  expiresIn: number;
  tokenType: string;
};

export class SupabaseBrowserConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseBrowserConfigError';
  }
}

function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function getSupabaseStorageKey(): string {
  const projectRef = projectRefFromUrl(SUPABASE_URL);
  return projectRef ? `sb-${projectRef}-auth-token` : 'chavea-supabase-auth-token';
}

function assertBrowserConfig(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new SupabaseBrowserConfigError(
      'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar configurados no frontend.',
    );
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL)) {
    throw new SupabaseBrowserConfigError('VITE_SUPABASE_URL não é uma URL válida do Supabase.');
  }
}

export function getSupabaseClient(): SupabaseClient {
  assertBrowserConfig();
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: window.localStorage,
        storageKey: getSupabaseStorageKey(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: {
        headers: { 'X-Client-Info': 'chavea-pwa' },
      },
    });
  }
  return client;
}

/**
 * Fast, network-free hint used before React mounts. It never authorizes a user;
 * the Worker still validates the Bearer JWT on every protected request.
 */
export function hydrateSupabaseAccessTokenSync(): boolean {
  try {
    const raw = window.localStorage.getItem(getSupabaseStorageKey());
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown };
    return Boolean(
      (typeof parsed.access_token === 'string' && parsed.access_token.length > 0) ||
      (typeof parsed.refresh_token === 'string' && parsed.refresh_token.length > 0),
    );
  } catch {
    return false;
  }
}

export async function readPersistedSupabaseSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Required by the Chavea HTTP client. getSession reads the localStorage-backed
 * Supabase session and refreshes it when necessary before a protected API call.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  const session = await readPersistedSupabaseSession();
  return session?.access_token ?? null;
}

export async function refreshSupabaseSession(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { data, error } = await getSupabaseClient().auth.refreshSession();
      if (error) throw error;
      return data.session;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function refreshSupabaseAccessToken(): Promise<string | null> {
  return (await refreshSupabaseSession())?.access_token ?? null;
}

export async function persistSupabaseSession(session: BrowserSessionEnvelope): Promise<Session> {
  const { data, error } = await getSupabaseClient().auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error || !data.session) throw error ?? new Error('SUPABASE_SESSION_PERSIST_FAILED');
  return data.session;
}

export async function signInWithSupabasePassword(input: {
  email?: string;
  phone?: string;
  password: string;
}): Promise<{ session: Session; user: SupabaseAuthUser }> {
  const credentials = input.email
    ? { email: input.email.trim().toLowerCase(), password: input.password }
    : { phone: normalizeBrazilPhone(input.phone ?? ''), password: input.password };
  const { data, error } = await getSupabaseClient().auth.signInWithPassword(credentials);
  if (error) throw error;
  if (!data.session || !data.user) throw new Error('SUPABASE_LOGIN_SESSION_MISSING');
  return { session: data.session, user: data.user };
}

export async function signUpWithSupabasePassword(input: {
  name: string;
  email?: string;
  phone?: string;
  password: string;
}): Promise<{ session: Session | null; user: SupabaseAuthUser | null }> {
  const credentials = input.email
    ? {
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: { data: { name: input.name.trim(), source: 'chavea-pwa' } },
      }
    : {
        phone: normalizeBrazilPhone(input.phone ?? ''),
        password: input.password,
        options: { data: { name: input.name.trim(), source: 'chavea-pwa' } },
      };
  const { data, error } = await getSupabaseClient().auth.signUp(credentials);
  if (error) throw error;
  return { session: data.session, user: data.user };
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = new URL('/dashboard', window.location.origin).toString();
  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

export function subscribeSupabaseAuthState(
  listener: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const { data } = getSupabaseClient().auth.onAuthStateChange(listener);
  return () => data.subscription.unsubscribe();
}

/** Remove only Chavea's Supabase session. No application/business data lives here. */
export function clearSupabaseSessionStorage(): void {
  try {
    window.localStorage.removeItem(getSupabaseStorageKey());
  } catch {
    // Storage can be restricted in private browsing; the caller still redirects.
  }
}

export async function clearSupabaseSession(): Promise<void> {
  clearSupabaseSessionStorage();
  try {
    await Promise.race([
      getSupabaseClient().auth.signOut({ scope: 'local' }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('AUTH_SIGNOUT_TIMEOUT')), 1_500);
      }),
    ]);
  } catch {
    // The persisted token has already been removed. Remote sign-out is best effort.
  }
}

function normalizeBrazilPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return value.trim();
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
}
