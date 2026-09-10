import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uruwrztfbjbykgxwtgvg.supabase.co';
const AUTH_PROXY_KEY = 'chavea-browser-auth-proxy';
const AUTH_PROXY_PATH = '/api/auth/supabase-proxy';
const SUPABASE_STORAGE_KEY = 'sb-uruwrztfbjbykgxwtgvg-auth-token';
const AUTH_REQUEST_WAIT_MS = 4_500;
const TOKEN_REFRESH_SKEW_MS = 30_000;

let cachedAccessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let hydrationInFlight: Promise<string | null> | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;

type StoredSessionShape = {
  access_token?: unknown;
  refresh_token?: unknown;
};

export class SupabaseAuthRestoringError extends Error {
  constructor(message = 'A sessão ainda está sendo restaurada.') {
    super(message);
    this.name = 'SupabaseAuthRestoringError';
  }
}

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

function storedRefreshToken(): string | null {
  const stored = readStoredSessionSync();
  return typeof stored?.refresh_token === 'string' && stored.refresh_token.length > 0
    ? stored.refresh_token
    : null;
}

function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function tokenNeedsRefresh(token: string): boolean {
  const expiry = decodeJwtExpiryMs(token);
  return expiry !== null && expiry <= Date.now() + TOKEN_REFRESH_SKEW_MS;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new SupabaseAuthRestoringError()),
      timeoutMs,
    );
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

/**
 * Network-free bootstrap used before React mounts. Supabase remains the source
 * of truth, but the first API call can attach the already-persisted Bearer JWT
 * without waiting for the Supabase SDK or getSession().
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

async function getSupabaseClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, AUTH_PROXY_KEY, {
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
      }),
    );
  }
  return clientPromise;
}

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
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  cachedAccessToken = data.session?.access_token ?? null;
  return data.session;
}

export async function persistSupabaseSession(session: BrowserSessionEnvelope): Promise<Session> {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.setSession({
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
      const client = await getSupabaseClient();
      const { data, error } = await client.auth.refreshSession();
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

/**
 * Central auth barrier for every protected API call.
 *
 * If a refresh is already running, all queries wait for the same promise.
 * If the PWA has persisted auth material but the in-memory token is not ready,
 * hydrate/refresh once instead of firing an anonymous request. A bounded wait
 * prevents a WebKit storage stall from freezing the UI indefinitely.
 */
export async function getSupabaseAccessTokenForRequest(
  timeoutMs = AUTH_REQUEST_WAIT_MS,
): Promise<string | null> {
  if (refreshInFlight) {
    return withTimeout(refreshInFlight, timeoutMs);
  }

  if (cachedAccessToken && !tokenNeedsRefresh(cachedAccessToken)) {
    return cachedAccessToken;
  }

  const stored = readStoredSessionSync();
  const storedAccessToken = typeof stored?.access_token === 'string' ? stored.access_token : null;
  const refreshToken = storedRefreshToken();

  if (!cachedAccessToken && storedAccessToken) {
    cachedAccessToken = storedAccessToken;
  }

  if (cachedAccessToken && !tokenNeedsRefresh(cachedAccessToken)) {
    return cachedAccessToken;
  }

  if (!cachedAccessToken && !refreshToken) {
    return null;
  }

  if (!hydrationInFlight) {
    hydrationInFlight = (async () => {
      const session = await readPersistedSupabaseSession();
      if (session?.access_token && !tokenNeedsRefresh(session.access_token)) {
        cachedAccessToken = session.access_token;
        return cachedAccessToken;
      }

      if (session?.refresh_token || refreshToken) {
        return refreshSupabaseAccessToken();
      }

      return session?.access_token ?? null;
    })().finally(() => {
      hydrationInFlight = null;
    });
  }

  try {
    return await withTimeout(hydrationInFlight, timeoutMs);
  } catch (error) {
    if (error instanceof SupabaseAuthRestoringError) throw error;
    throw new SupabaseAuthRestoringError(
      error instanceof Error ? error.message : 'Não foi possível restaurar a sessão a tempo.',
    );
  }
}

export function subscribeSupabaseAuthState(
  listener: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  let active = true;
  let unsubscribe: (() => void) | null = null;

  void getSupabaseClient().then((client) => {
    if (!active) return;
    const { data } = client.auth.onAuthStateChange(listener);
    unsubscribe = () => data.subscription.unsubscribe();
  }).catch((error) => {
    console.warn('[auth] Supabase state listener unavailable', error);
  });

  return () => {
    active = false;
    unsubscribe?.();
  };
}

export async function clearSupabaseSession(): Promise<void> {
  cachedAccessToken = null;
  try {
    window.localStorage.removeItem(SUPABASE_STORAGE_KEY);
  } catch {
    // Storage may be restricted; in-memory auth is already cleared.
  }

  try {
    const client = await getSupabaseClient();
    await Promise.race([
      client.auth.signOut({ scope: 'local' }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('AUTH_SIGNOUT_TIMEOUT')), 2_000);
      }),
    ]);
  } catch {
    // Best-effort local sign-out; the persisted token key was removed above.
  }
}
