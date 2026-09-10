import { Hono } from 'hono';
import type { Env } from '../types/env';
import { extractBearerToken, getSupabaseAuthProxyConfig } from '../services/supabase-auth.service';

const supabaseAuthProxy = new Hono<Env>();

function proxyHeaders(contentType: string | undefined, serviceRoleKey: string, userAuthorization?: string) {
  const headers = new Headers();
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', userAuthorization ?? `Bearer ${serviceRoleKey}`);
  if (contentType) headers.set('Content-Type', contentType);
  return headers;
}

async function forwardResponse(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Browser Supabase clients need the refresh endpoint for persistent sessions.
// This is intentionally NOT a generic GoTrue proxy: only refresh_token is
// accepted, so the server-side service-role key can never expose admin APIs.
supabaseAuthProxy.post('/auth/v1/token', async (c) => {
  if (c.req.query('grant_type') !== 'refresh_token') {
    return c.json({ error: 'AUTH_PROXY_GRANT_NOT_ALLOWED' }, 403);
  }

  const { url, serviceRoleKey } = getSupabaseAuthProxyConfig(c.env);
  const target = new URL('/auth/v1/token', url);
  target.searchParams.set('grant_type', 'refresh_token');

  const response = await fetch(target, {
    method: 'POST',
    headers: proxyHeaders(c.req.header('content-type'), serviceRoleKey),
    body: await c.req.raw.clone().arrayBuffer(),
  });
  return forwardResponse(response);
});

supabaseAuthProxy.get('/auth/v1/user', async (c) => {
  const authorization = c.req.header('authorization');
  if (!extractBearerToken(authorization)) return c.json({ error: 'UNAUTHORIZED' }, 401);

  const { url, serviceRoleKey } = getSupabaseAuthProxyConfig(c.env);
  const response = await fetch(new URL('/auth/v1/user', url), {
    method: 'GET',
    headers: proxyHeaders(undefined, serviceRoleKey, authorization),
  });
  return forwardResponse(response);
});

supabaseAuthProxy.post('/auth/v1/logout', async (c) => {
  const authorization = c.req.header('authorization');
  if (!extractBearerToken(authorization)) return c.json({ error: 'UNAUTHORIZED' }, 401);

  const scope = c.req.query('scope');
  if (scope && !['global', 'local', 'others'].includes(scope)) {
    return c.json({ error: 'AUTH_PROXY_SCOPE_NOT_ALLOWED' }, 403);
  }

  const { url, serviceRoleKey } = getSupabaseAuthProxyConfig(c.env);
  const target = new URL('/auth/v1/logout', url);
  if (scope) target.searchParams.set('scope', scope);
  const response = await fetch(target, {
    method: 'POST',
    headers: proxyHeaders(c.req.header('content-type'), serviceRoleKey, authorization),
    body: c.req.header('content-length') === '0' ? undefined : await c.req.raw.clone().arrayBuffer(),
  });
  return forwardResponse(response);
});

export { supabaseAuthProxy };
