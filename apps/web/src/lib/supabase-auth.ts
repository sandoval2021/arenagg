import { createClient, type Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uruwrztfbjbykgxwtgvg.supabase.co';
const AUTH_PROXY_KEY = 'chavea-browser-auth-proxy';
const AUTH_PROXY_PATH = '/api/auth/supabase-proxy';
const SUPABASE_STORAGE_KEY = 'sb-uruwrztfbjbykgxwtgvg-auth-token';
const FAST_SESSION_HINT_KEY = 'chaveaHasSupabaseSession';
const TOKEN_REFRESH_TIMEOUT_MS = 2_500;

let cachedAccessToken: string | null = null;
let cachedExpiresAt: number | null = null;
let storageWritesBlocked = false;
let refreshInFlight: Promise<string | null> | null = null;

function safeLocalGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Safari private/managed modes can reject storage writes.
  }
}

function safeLocalRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best effort only. In-memory auth state is cleared independently.
  }
}

const resilientLocalStorage = {
  getItem(key: string): string | null {
    return safeLocalGet(key);
  },
  setItem(key: string, value: string): void {
    if (storageWritesBlocked) return;
    safeLocalSet(key, value);
    if (key === SUPABASE_STORAGE_KEY) safeLocalSet(FAST_SESSION_HINT_KEY, 'true');
  },
  removeItem(key: string): void {
    safeLocalRemove(key);
    if (key === SUPABASE_STORAGE_KEY) safeLocalRemove(FAST_SESSION_HINT_KEY);
  },
};

type StoredSessionShape = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
};

function readStoredSession(): StoredSessionShape | null {
  const raw = safeLocalGet(SUPABASE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSessionShape;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Runs before React mounts. It is intentionally synchronous and network-free so
 * an installed PWA can paint its authenticated shell on the first frame.
 */
export function hydrateSupabaseAccessTokenSync(): boolean {
  const stored = readStoredSession();
  const hasStoredSession = Boolean(
    stored &&
    (typeof stored.access_token === 'string' || typeof stored.refresh_token === 'string'),
  );
  const hinted = safeLocalGet(FAST_SESSION_HINT_KEY) === 'true';

  if (!hasStoredSession) {
    cachedAccessToken = null;
    cachedExpiresAt = null;
    if (!hinted) return false;
    // A hint without GoTrue storage is stale and must not keep a protected shell alive.
    safeLocalRemove(FAST_SESSION_HINT_KEY);
    return false;
  }

  safeLocalSet(FAST_SESSION_HINT_KEY, 'true');
  cachedAccessToken = typeof stored?.access_token === 'string' ? stored.access_token : null;
  cachedExpiresAt = typeof stored?.expires_at === 'number' ? stored.expires_at : null;
  return true;
}

export function hasPersistedSupabaseSessionSync(): boolean {
  if (safeLocalGet(FAST_SESSION_HINT_KEY) === 'true') return true;
  return hydrateSupabaseAccessTokenSync();
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

export const supabase = createClient(SUPABASE_URL, AUTH_PROXY_KEY, {
  auth: {
    storage: resilientLocalStorage,
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

export function setSupabaseAccessToken(accessToken: string | null, expiresAt: number | null = null): void {
  cachedAccessToken = accessToken;
  cachedExpiresAt = expiresAt;
  if (accessToken) safeLocalSet(FAST_SESSION_HINT_KEY, 'true');
}

export function suspendSupabasePersistence(): void {
  storageWritesBlocked = true;
  cachedAccessToken = null;
  cachedExpiresAt = null;
  refreshInFlight = null;
  supabase.auth.stopAutoRefresh();
}

export function resumeSupabasePersistence(): void {
  storageWritesBlocked = false;
  supabase.auth.startAutoRefresh();
}

export async function persistSupabaseSession(session: BrowserSessionEnvelope): Promise<Session> {
  resumeSupabasePersistence();
  const { data, error } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error || !data.session) {
    cachedAccessToken = null;
    cachedExpiresAt = null;
    throw error ?? new Error('SUPABASE_SESSION_PERSIST_FAILED');
  }
  cachedAccessToken = data.session.access_token;
  cachedExpiresAt = data.session.expires_at ?? null;
  safeLocalSet(FAST_SESSION_HINT_KEY, 'true');
  return data.session;
}

function tokenIsFresh(): boolean {
  if (!cachedAccessToken) return false;
  if (!cachedExpiresAt) return true;
  return cachedExpiresAt * 1000 > Date.now() + 15_000;
}

/**
 * Hot requests resolve immediately from memory while the token is fresh. Only
 * an expired token pays the unavoidable refresh cost, and that work never
 * blocks React's first paint because the app shell has already mounted.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (tokenIsFresh()) return cachedAccessToken;
  if (!hasPersistedSupabaseSessionSync()) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      let timeoutId = 0;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error('AUTH_REFRESH_TIMEOUT')), TOKEN_REFRESH_TIMEOUT_MS);
        });
        const result = await Promise.race([supabase.auth.getSession(), timeout]);
        if (result.error || !result.data.session) return null;
        cachedAccessToken = result.data.session.access_token;
        cachedExpiresAt = result.data.session.expires_at ?? null;
        safeLocalSet(FAST_SESSION_HINT_KEY, 'true');
        return cachedAccessToken;
      } catch {
        return null;
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

export function clearSupabaseSessionSync(): void {
  suspendSupabasePersistence();
  safeLocalRemove(SUPABASE_STORAGE_KEY);
  safeLocalRemove(FAST_SESSION_HINT_KEY);
}

export async function clearSupabaseSession(): Promise<void> {
  clearSupabaseSessionSync();
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('AUTH_SIGNOUT_TIMEOUT')), 1_500);
      }),
    ]);
  } catch {
    // Storage/in-memory state is already cleared synchronously above.
  }
}
