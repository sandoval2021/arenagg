import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createSession, sendCookie, type D1DatabasePort } from './native-auth.routes';

type GoogleEnv = {
  Bindings: {
    DB: D1DatabasePort;
    WEB_APP_URL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REDIRECT_URI?: string;
  };
};

const STATE_COOKIE = '__Host-chavea_google_state';
export const googleOAuthRoutes = new Hono<GoogleEnv>();

function options(env: GoogleEnv['Bindings']) {
  const web = env.WEB_APP_URL ?? 'https://chavea.pages.dev';
  const redirect = env.GOOGLE_REDIRECT_URI ?? web + '/api/auth/google/callback';
  const url = new URL(redirect);
  const webUrl = new URL(web);
  // The configured callback must belong to the first-party Pages origin.
  if (url.origin !== webUrl.origin || url.pathname !== '/api/auth/google/callback' ||
      webUrl.protocol !== 'https:' || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return null;
  }
  return { web, redirect, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

googleOAuthRoutes.get('/google', c => {
  const config = options(c.env);
  if (!config) return c.json({ error: 'GOOGLE_OAUTH_NOT_CONFIGURED' }, 503);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  setCookie(c, STATE_COOKIE, state, {
    secure: true, httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirect,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return c.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString(), 302);
});

googleOAuthRoutes.get('/google/callback', async c => {
  const config = options(c.env);
  if (!config) return c.json({ error: 'GOOGLE_OAUTH_NOT_CONFIGURED' }, 503);
  const code = c.req.query('code');
  const state = c.req.query('state');
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/', secure: true, sameSite: 'Lax' });
  if (!code || !state || !expected || !/^[a-f0-9]{64}$/.test(state) || state !== expected) {
    return c.json({ error: 'INVALID_OAUTH_STATE' }, 400);
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: config.clientId, client_secret: config.clientSecret,
      redirect_uri: config.redirect, grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!tokenResponse?.ok) return c.json({ error: 'OAUTH_TOKEN_EXCHANGE_FAILED' }, 401);
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return c.json({ error: 'OAUTH_TOKEN_MISSING' }, 401);
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!profileResponse?.ok) return c.json({ error: 'OAUTH_PROFILE_FAILED' }, 401);
  const profile = await profileResponse.json() as {
    sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string;
  };
  if (!profile.sub || !profile.email || !profile.email_verified) {
    return c.json({ error: 'GOOGLE_EMAIL_NOT_VERIFIED' }, 401);
  }
  const email = profile.email.trim().toLowerCase();
  const googleId = profile.sub;
  const db = c.env.DB;
  let user = await db.prepare(`
    SELECT u."id" AS "id", u."isActive" AS "isActive" FROM "AuthAccount" a
    JOIN "User" u ON a."userId" = u."id"
    WHERE a."provider" = 'google' AND a."providerAccountId" = ?1
  `).bind(googleId).first<{ id: string; isActive: number | boolean }>();

  if (!user) {
    // Never auto-link a Google login to an unverified password-based account.
    // Otherwise someone could pre-register another person's e-mail and then
    // retain password access after the real owner signs in with Google.
    const collision = await db.prepare('SELECT "id" FROM "User" WHERE "email" = ?1')
      .bind(email).first<{ id: string }>();
    if (collision) return c.json({ error: 'ACCOUNT_LINK_REQUIRED' }, 409);
    const id = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.batch([
        db.prepare(`INSERT INTO "User"
          ("id","name","displayName","avatarUrl","email","emailVerified","role","isActive","createdAt","updatedAt")
          VALUES (?1,?2,NULL,?3,?4,?5,'USER',1,?6,?7)`)
          .bind(id, (profile.name || email.split('@')[0]).slice(0, 80), profile.picture || null, email,
            now, now, now),
        db.prepare(`INSERT INTO "UserProfile" ("userId","createdAt","updatedAt")
          VALUES (?1,?2,?3)`).bind(id, now, now),
        db.prepare(`INSERT INTO "AuthAccount" ("id","userId","provider","providerAccountId","createdAt")
          VALUES (?1,?2,'google',?3,?4)`).bind(accountId, id, googleId, now),
      ]);
    } catch {
      return c.json({ error: 'ACCOUNT_CREATION_FAILED' }, 503);
    }
    user = { id, isActive: 1 };
  }
  if (!user.isActive) return c.json({ error: 'ACCOUNT_DISABLED' }, 403);
  try {
    sendCookie(c, await createSession(db, user.id));
    // Avoid tokens in URL fragments or query strings; cookie is HttpOnly.
    return c.redirect(config.web + '/dashboard', 302);
  } catch {
    return c.json({ error: 'SESSION_CREATION_FAILED' }, 503);
  }
});
