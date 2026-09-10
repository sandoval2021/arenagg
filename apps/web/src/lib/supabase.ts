import { createClient } from '@supabase/supabase-js';

const PRODUCTION_API_URL = 'https://arenagg-api.sandovaloliveira284.workers.dev';

function resolveSupabaseAuthProxyUrl(): string {
  if (import.meta.env.PROD) return `${window.location.origin}/api/supabase`;
  const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || PRODUCTION_API_URL;
  return `${apiUrl}/api/supabase`;
}

// The browser uses the standard Supabase Auth session manager with persistent
// localStorage. The public key value is only a non-secret client identifier:
// the same-origin Worker proxy replaces it server-side and exposes ONLY the
// refresh/user/logout GoTrue endpoints, never Supabase admin APIs.
export const supabase = createClient(resolveSupabaseAuthProxyUrl(), 'chavea-public-auth-proxy', {
  auth: {
    persistSession: true,
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'chavea-supabase-auth',
  },
});

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[auth] unable to restore Supabase session', error.message);
    return null;
  }
  return data.session?.access_token ?? null;
}
