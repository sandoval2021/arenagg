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

// /api is proxied by Cloudflare Pages in production, so this is a first-party
// session cookie. Lax is more resilient in standalone PWAs than third-party-style
// SameSite=None while keeping the session inaccessible to JavaScript.
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
};

function parse<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function attachSession(
  c: Parameters<typeof setCookie>[0],
  prisma: Env['Variables']['prisma'],
  userId: string,
) {
  const session = await createSession(prisma, userId);
  setCookie(c, 'chavea_session', session.token, {
    ...cookieOptions,
    expires: session.expiresAt,
  });
}

type RegistrationStage = 'lookup' | 'hash_password' | 'create_user' | 'create_session';

auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: 'INVALID_INPUT',
        issues: parsed.error.flatten(),
      },
      400,
    );
  }

  const input = parsed.data;
  const email = input.email ? normalizeEmail(input.email) : null;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const prisma = c.get('prisma');
  let stage: RegistrationStage = 'lookup';

  try {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    });

    if (existing) return c.json({ error: 'ACCOUNT_EXISTS' }, 409);

    stage = 'hash_password';
    const passwordHash = await hashPassword(input.password);

    stage = 'create_user';
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        phone,
        passwordHash,
      },
    });

    stage = 'create_session';
    await attachSession(c, prisma, user.id);
    return c.json({ user: toPublicUser(user) }, 201);
  } catch (error) {
    console.log('[auth.register] failed', {
      stage,
      nameLength: input.name.length,
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (isPrismaUniqueConstraintError(error)) {
      return c.json({ error: 'ACCOUNT_EXISTS' }, 409);
    }

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

  await attachSession(c, prisma, user.id);
  return c.json({ user: toPublicUser(user) });
});

auth.get('/me', async (c) => {
  const token = getCookie(c, 'chavea_session');
  if (!token) return c.json({ user: null });
  return c.json({ user: await getSessionUser(c.get('prisma'), token) });
});

auth.post('/logout', async (c) => {
  const token = getCookie(c, 'chavea_session');
  if (token) await revokeSession(c.get('prisma'), token);
  deleteCookie(c, 'chavea_session', { path: '/', secure: true });
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
    where: {
      provider_providerAccountId: {
        provider: 'google',
        providerAccountId: profile.sub,
      },
    },
    create: {
      userId: user.id,
      provider: 'google',
      providerAccountId: profile.sub,
    },
    update: { userId: user.id },
  });

  await attachSession(c, prisma, user.id);
  deleteCookie(c, 'chavea_oauth_state', { path: '/' });
  return c.redirect(c.env.WEB_APP_URL);
});

export { auth };
