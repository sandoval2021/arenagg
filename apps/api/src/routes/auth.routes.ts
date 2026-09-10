import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Env } from '../types/env';
import {
  createSession,
  getSessionUser,
  hashPassword,
  normalizeEmail,
  normalizePhone,
  revokeSession,
  toPublicUser,
  verifyPassword,
} from '../services/auth.service';
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

function browserSession(token: string, expiresAt: Date) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
  return {
    accessToken: token,
    refreshToken: '',
    expiresAt: expiresAtSeconds,
    expiresIn: Math.max(0, expiresAtSeconds - nowSeconds),
    tokenType: 'bearer',
  };
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

type RegistrationStage = 'lookup' | 'hash_password' | 'create_user' | 'session';

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

    stage = 'session';
    const created = await createSession(prisma, user.id);
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
    const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
    return c.json(
      {
        user: toPublicUser(user),
        session: browserSession(created.token, created.expiresAt),
        rewards: { dailyPackGranted },
      },
      201,
    );
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
    return c.json({ error: 'REGISTRATION_FAILED', stage }, 500);
  }
});

auth.post('/login', async (c) => {
  const input = parse(loginSchema, await c.req.json().catch(() => null));
  if (!input) return c.json({ error: 'INVALID_INPUT' }, 400);

  const prisma = c.get('prisma');
  const normalizedIdentifier = input.email
    ? normalizeEmail(input.email)
    : normalizePhone(input.phone!);

  try {
    const user = input.email
      ? await prisma.user.findUnique({ where: { email: normalizedIdentifier } })
      : await prisma.user.findUnique({ where: { phone: normalizedIdentifier } });

    if (!user?.passwordHash || !user.isActive || !(await verifyPassword(user.passwordHash, input.password))) {
      return c.json({ error: 'INVALID_CREDENTIALS' }, 401);
    }

    const created = await createSession(prisma, user.id);
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
    const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
    return c.json({
      user: toPublicUser(user),
      session: browserSession(created.token, created.expiresAt),
      rewards: { dailyPackGranted },
    });
  } catch (error) {
    console.error('[auth.login] failed', {
      identifierType: input.email ? 'email' : 'phone',
      identifierLength: normalizedIdentifier.length,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        error: 'LOGIN_FAILED',
        message: 'Não foi possível concluir o login agora. Tente novamente.',
      },
      500,
    );
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

  try {
    const created = await createSession(prisma, legacyUser.id);
    await revokeSession(prisma, legacyToken).catch(() => undefined);
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
    const dailyPackGranted = await claimDailyRewardSafely(prisma, legacyUser.id);
    return c.json({
      user: legacyUser,
      session: browserSession(created.token, created.expiresAt),
      rewards: { dailyPackGranted },
      migrated: true,
    });
  } catch (error) {
    console.error('[auth.migrate-cookie] failed', {
      userId: legacyUser.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: 'AUTH_MIGRATION_FAILED' }, 500);
  }
});

auth.get('/me', async (c) => {
  const token = readBearerToken(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão ausente.' }, 401);

  const prisma = c.get('prisma');
  const user = await getSessionUser(prisma, token);
  if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }, 401);

  const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
  return c.json({ user, rewards: { dailyPackGranted } });
});

auth.post('/logout', async (c) => {
  const token = readBearerToken(c.req.header('Authorization'));
  if (token) await revokeSession(c.get('prisma'), token).catch(() => undefined);
  deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });
  return c.body(null, 204);
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
    const created = await createSession(prisma, user.id);
    deleteCookie(c, 'chavea_oauth_state', { path: '/' });
    deleteCookie(c, 'chavea_session', { path: '/', secure: true, sameSite: 'Lax' });

    const redirect = new URL(c.env.WEB_APP_URL);
    redirect.hash = new URLSearchParams({
      access_token: created.token,
      expires_in: String(Math.max(0, Math.floor((created.expiresAt.getTime() - Date.now()) / 1000))),
      expires_at: String(Math.floor(created.expiresAt.getTime() / 1000)),
      token_type: 'bearer',
      type: 'oauth',
    }).toString();
    return c.redirect(redirect.toString());
  } catch (error) {
    console.error('[auth.google] session issue failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: 'LOGIN_FAILED' }, 500);
  }
});

export { auth };
