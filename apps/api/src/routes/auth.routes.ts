import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Env } from '../types/env';
import {
  getSessionUser,
  hashPassword,
  normalizeEmail,
  normalizePhone,
  toPublicUser,
  verifyPassword,
} from '../services/auth.service';
import {
  createTemporaryMigrationPassword,
  provisionAndIssueSupabaseSession,
  resolveBearerUser,
  revokeSupabaseSession,
  SupabaseAuthBridgeError,
} from '../services/supabase-auth.service';
import { claimDailyLoginReward } from '../services/sticker-pack-rewards.service';

const auth = new Hono<Env>();
const password = z.string().min(10).max(128);
const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().email().optional(),
    phone: z.string().min(8).max(24).optional(),
    password,
  })
  .refine((value) => Boolean(value.email) !== Boolean(value.phone), 'Provide exactly one identifier');
const loginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(8).max(24).optional(),
    password,
  })
  .refine((value) => Boolean(value.email) !== Boolean(value.phone), 'Provide exactly one identifier');

function parse<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function readBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

async function claimDailyRewardSafely(
  prisma: Env['Variables']['prisma'],
  userId: string,
): Promise<boolean> {
  try {
    return await claimDailyLoginReward(prisma, userId);
  } catch (error) {
    console.error('[auth.daily-reward] failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function authBridgeFailure(c: Context<Env>, error: unknown) {
  console.error('[auth.supabase] bridge failed', {
    error: error instanceof Error ? error.message : String(error),
    code: error instanceof SupabaseAuthBridgeError ? error.code : undefined,
  });
  const configured = !(error instanceof SupabaseAuthBridgeError) || error.code !== 'SUPABASE_AUTH_NOT_CONFIGURED';
  return c.json(
    {
      error: configured ? 'AUTH_SESSION_ISSUE_FAILED' : 'AUTH_SERVICE_NOT_CONFIGURED',
      message: configured
        ? 'Não foi possível criar a sessão segura agora. Tente novamente.'
        : 'O serviço de autenticação está temporariamente indisponível.',
    },
    503,
  );
}

type RegistrationStage = 'lookup' | 'hash_password' | 'create_user' | 'supabase_session';

auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);
  }

  const input = parsed.data;
  const email = input.email ? normalizeEmail(input.email) : null;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const prisma = c.get('prisma');
  let stage: RegistrationStage = 'lookup';

  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
    });
    if (existing) return c.json({ error: 'ACCOUNT_EXISTS' }, 409);

    stage = 'hash_password';
    const passwordHash = await hashPassword(input.password);

    stage = 'create_user';
    const user = await prisma.user.create({
      data: { name: input.name, email, phone, passwordHash },
    });

    stage = 'supabase_session';
    const session = await provisionAndIssueSupabaseSession(c.env, prisma, user, input.password);
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
    const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
    return c.json({ user: toPublicUser(user), session, rewards: { dailyPackGranted } }, 201);
  } catch (error) {
    console.error('[auth.register] failed', {
      stage,
      nameLength: input.name.length,
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (isPrismaUniqueConstraintError(error)) return c.json({ error: 'ACCOUNT_EXISTS' }, 409);
    if (error instanceof SupabaseAuthBridgeError) return authBridgeFailure(c, error);
    return c.json({ error: 'REGISTRATION_FAILED', stage }, 500);
  }
});

auth.post('/login', async (c) => {
  const input = parse(loginSchema, await c.req.json().catch(() => null));
  if (!input) return c.json({ error: 'INVALID_INPUT' }, 400);

  const prisma = c.get('prisma');
  const user = input.email
    ? await prisma.user.findUnique({ where: { email: normalizeEmail(input.email) } })
    : await prisma.user.findUnique({ where: { phone: normalizePhone(input.phone!) } });

  if (!user?.passwordHash || !user.isActive || !(await verifyPassword(user.passwordHash, input.password))) {
    return c.json({ error: 'INVALID_CREDENTIALS' }, 401);
  }

  try {
    const session = await provisionAndIssueSupabaseSession(c.env, prisma, user, input.password);
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
    const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
    return c.json({ user: toPublicUser(user), session, rewards: { dailyPackGranted } });
  } catch (error) {
    return authBridgeFailure(c, error);
  }
});

auth.post('/migrate-cookie', async (c) => {
  const legacyToken = getCookie(c, 'chavea_session');
  if (!legacyToken) return c.json({ error: 'NO_LEGACY_SESSION' }, 401);

  const prisma = c.get('prisma');
  const legacyUser = await getSessionUser(prisma, legacyToken);
  if (!legacyUser) {
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
    return c.json({ error: 'NO_LEGACY_SESSION' }, 401);
  }

  const user = await prisma.user.findUnique({ where: { id: legacyUser.id } });
  if (!user || !user.isActive) return c.json({ error: 'NO_LEGACY_SESSION' }, 401);

  try {
    const session = await provisionAndIssueSupabaseSession(
      c.env,
      prisma,
      user,
      createTemporaryMigrationPassword(),
    );
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
    const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
    return c.json({ user: toPublicUser(user), session, rewards: { dailyPackGranted }, migrated: true });
  } catch (error) {
    return authBridgeFailure(c, error);
  }
});

auth.get('/me', async (c) => {
  const token = readBearerToken(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão ausente.' }, 401);

  const prisma = c.get('prisma');
  const user = await resolveBearerUser(c.env, prisma, token);
  if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }, 401);

  const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
  return c.json({ user, rewards: { dailyPackGranted } });
});

auth.post('/logout', async (c) => {
  const token = readBearerToken(c.req.header('Authorization'));
  if (token) await revokeSupabaseSession(c.env, token);
  deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
  return c.body(null, 204);
});

auth.all('/supabase-proxy', async (c) => {
  const rawTarget = c.req.query('target');
  const serviceRoleKey = c.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = c.env.SUPABASE_URL?.trim();
  if (!rawTarget || !serviceRoleKey || !supabaseUrl) {
    return c.json({ error: 'AUTH_SERVICE_NOT_CONFIGURED' }, 503);
  }

  let target: URL;
  try {
    target = new URL(rawTarget, supabaseUrl);
  } catch {
    return c.json({ error: 'INVALID_AUTH_PROXY_TARGET' }, 400);
  }

  const projectOrigin = new URL(supabaseUrl).origin;
  const method = c.req.method.toUpperCase();
  const grantType = target.searchParams.get('grant_type');
  const allowed =
    target.origin === projectOrigin &&
    ((target.pathname === '/auth/v1/token' && method === 'POST' && ['password', 'refresh_token'].includes(grantType ?? '')) ||
      (target.pathname === '/auth/v1/user' && method === 'GET') ||
      (target.pathname === '/auth/v1/logout' && method === 'POST'));

  if (!allowed) return c.json({ error: 'AUTH_PROXY_TARGET_NOT_ALLOWED' }, 403);

  const headers = new Headers();
  headers.set('apikey', serviceRoleKey);
  headers.set('Accept', 'application/json');
  const contentType = c.req.header('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  const apiVersion = c.req.header('X-Supabase-Api-Version');
  if (apiVersion) headers.set('X-Supabase-Api-Version', apiVersion);

  if (target.pathname !== '/auth/v1/token') {
    const authorization = c.req.header('Authorization');
    if (!readBearerToken(authorization)) return c.json({ error: 'UNAUTHORIZED' }, 401);
    headers.set('Authorization', authorization!);
  }

  const upstream = await fetch(target.toString(), {
    method,
    headers,
    body: method === 'GET' ? undefined : await c.req.arrayBuffer(),
    redirect: 'manual',
  });

  const responseHeaders = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    'Cache-Control': 'no-store',
  });
  const requestId = upstream.headers.get('X-Request-Id');
  if (requestId) responseHeaders.set('X-Request-Id', requestId);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
});

auth.get('/google', (c) => {
  const state = crypto.randomUUID();
  setCookie(c, 'chavea_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', c.env.GOOGLE_REDIRECT_URI ?? '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return c.redirect(url.toString());
});

auth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const expected = getCookie(c, 'chavea_oauth_state');
  if (!code || !state || !expected || state !== expected) {
    return c.json({ error: 'INVALID_OAUTH_STATE' }, 400);
  }

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = c.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return c.json({ error: 'GOOGLE_OAUTH_NOT_CONFIGURED' }, 503);
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResponse.ok) return c.json({ error: 'OAUTH_TOKEN_EXCHANGE_FAILED' }, 401);

  const tokens = (await tokenResponse.json()) as { access_token: string };
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) return c.json({ error: 'OAUTH_PROFILE_FAILED' }, 401);

  const profile = (await profileResponse.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!profile.email || !profile.email_verified) {
    return c.json({ error: 'GOOGLE_EMAIL_NOT_VERIFIED' }, 401);
  }

  const prisma = c.get('prisma');
  const email = normalizeEmail(profile.email);
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: profile.name ?? email.split('@')[0],
        email,
        emailVerified: new Date(),
        avatarUrl: profile.picture,
      },
    });
  }

  await prisma.authAccount.upsert({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.sub } },
    create: { userId: user.id, provider: 'google', providerAccountId: profile.sub },
    update: { userId: user.id },
  });

  try {
    const session = await provisionAndIssueSupabaseSession(
      c.env,
      prisma,
      user,
      createTemporaryMigrationPassword(),
    );
    deleteCookie(c, 'chavea_oauth_state', { path: '/' });
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });

    const redirect = new URL(c.env.WEB_APP_URL);
    redirect.hash = new URLSearchParams({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      expires_in: String(session.expiresIn),
      expires_at: String(session.expiresAt ?? Math.floor(Date.now() / 1000) + session.expiresIn),
      token_type: session.tokenType,
      type: 'oauth',
    }).toString();
    return c.redirect(redirect.toString());
  } catch (error) {
    return authBridgeFailure(c, error);
  }
});

export { auth };
