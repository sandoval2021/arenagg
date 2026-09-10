import { createClient, type Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uruwrztfbjbykgxwtgvg.supabase.co';
const AUTH_PROXY_KEY = 'chavea-browser-auth-proxy';
const AUTH_PROXY_PATH = '/api/auth/supabase-proxy';

let cachedAccessToken: string | null = null;
let storageWritesBlocked = false;

const resilientLocalStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (storageWritesBlocked) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be temporarily unavailable in Safari private/managed mode.
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best effort only. The in-memory token is cleared independently.
    }
  },
};

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

export function suspendSupabasePersistence(): void {
  storageWritesBlocked = true;
  cachedAccessToken = null;
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
    throw error ?? new Error('SUPABASE_SESSION_PERSIST_FAILED');
  }
  cachedAccessToken = data.session.access_token;
  return data.session;
}

// Hot API requests must never wait on GoTrue's storage/Web Locks machinery.
// AuthProvider performs the single bounded getSession() bootstrap and keeps this
// cache current through onAuthStateChange. This makes Feed/Ranking/Copas use the
// Bearer token synchronously even if iOS leaves an auth lock in a bad state.
export function getSupabaseAccessToken(): string | null {
  return cachedAccessToken;
}

export async function clearSupabaseSession(): Promise<void> {
  suspendSupabasePersistence();
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('AUTH_SIGNOUT_TIMEOUT')), 1_500);
      }),
    ]);
  } catch {
    // Local state is already blocked/cleared by suspendSupabasePersistence().
  }
}
