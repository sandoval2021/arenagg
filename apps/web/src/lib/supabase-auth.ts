import { createClient, type Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uruwrztfbjbykgxwtgvg.supabase.co';
const AUTH_PROXY_KEY = 'chavea-browser-auth-proxy';
const AUTH_PROXY_PATH = '/api/auth/supabase-proxy';
const SUPABASE_STORAGE_KEY = 'sb-uruwrztfbjbykgxwtgvg-auth-token';

let cachedAccessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

type StoredSessionShape = {
  access_token?: unknown;
  refresh_token?: unknown;
};

function readStoredSessionSync(): StoredSessionShape | null {
  try {
    const raw = window.localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSessionShape;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Network-free bootstrap used before React mounts. Supabase remains the source
 * of truth, but the first API call can attach the already-persisted Bearer JWT
 * without waiting for getSession()/GoTrue round-trips.
 */
export function hydrateSupabaseAccessTokenSync(): boolean {
  const stored = readStoredSessionSync();
  cachedAccessToken = typeof stored?.access_token === 'string' ? stored.access_token : null;
  return Boolean(
    cachedAccessToken ||
    (stored && typeof stored.refresh_token === 'string' && stored.refresh_token.length > 0),
  );
}

async function proxiedAuthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const target = new URL(request.url);
  const projectOrigin = new URL(SUPABASE_URL).origin;

  if (target.origin !== projectOrigin || !target.pathname.startsWith('/auth/v1/')) {
    return fetch(request);
  }

  const proxyUrl = new URL(AUTH_PROXY_PATH, window.location.origin);
  proxyUrl.searchParams.set('target', `${target.pathname}${target.search}`);

  const headers = new Headers(request.headers);
  // The browser never receives the Worker service-role key. The restricted
  // same-origin auth proxy injects the server-side key only for whitelisted
  // GoTrue token/user/logout endpoints.
  headers.delete('apikey');
  headers.delete('x-client-info');

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();

  return fetch(proxyUrl, {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'manual',
  });
}

// iOS PWA source of truth: Supabase Auth persists access + refresh tokens in
// localStorage instead of relying on WebKit's standalone cookie lifecycle.
export const supabase = createClient(SUPABASE_URL, AUTH_PROXY_KEY, {
  auth: {
    storage: window.localStorage,
    storageKey: SUPABASE_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: proxiedAuthFetch,
  },
});

export type BrowserSessionEnvelope = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  expiresIn: number;
  tokenType: string;
};

export function setSupabaseAccessToken(accessToken: string | null): void {
  cachedAccessToken = accessToken;
}

export function getSupabaseAccessToken(): string | null {
  return cachedAccessToken;
}

export async function readPersistedSupabaseSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  cachedAccessToken = data.session?.access_token ?? null;
  return data.session;
}

export async function persistSupabaseSession(session: BrowserSessionEnvelope): Promise<Session> {
  const { data, error } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error || !data.session) {
    cachedAccessToken = null;
    throw error ?? new Error('SUPABASE_SESSION_PERSIST_FAILED');
  }
  cachedAccessToken = data.session.access_token;
  return data.session;
}

export async function refreshSupabaseAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      if (!data.session) {
        cachedAccessToken = null;
        return null;
      }
      cachedAccessToken = data.session.access_token;
      return cachedAccessToken;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function clearSupabaseSession(): Promise<void> {
  cachedAccessToken = null;
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('AUTH_SIGNOUT_TIMEOUT')), 2_000);
      }),
    ]);
  } catch {
    // Supabase uses a project-scoped localStorage key. Remove only Auth state;
    // never clear unrelated Chavea preferences/settings from localStorage.
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // If storage is unavailable there is nothing else the browser can persist.
    }
  }
}
