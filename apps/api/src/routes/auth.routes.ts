import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import {
  hashPassword,
  normalizeEmail,
  normalizePhone,
  toPublicUser,
  verifyPassword,
} from '../services/auth.service';
import {
  extractBearerToken,
  getBearerUser,
  issueSupabaseSession,
  removeProvisionedSupabaseUser,
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

type RegistrationStage = 'lookup' | 'hash_password' | 'create_user' | 'supabase_auth';

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
  let createdUser: Awaited<ReturnType<typeof prisma.user.create>> | null = null;

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
    createdUser = await prisma.user.create({
      data: {
        name: input.name,
        email,
        phone,
        passwordHash,
      },
    });

    stage = 'supabase_auth';
    const session = await issueSupabaseSession(c.env, createdUser, input.password);
    const dailyPackGranted = await claimDailyRewardSafely(prisma, createdUser.id);
    return c.json(
      { user: toPublicUser(createdUser), session, rewards: { dailyPackGranted } },
      201,
    );
  } catch (error) {
    console.error('[auth.register] failed', {
      stage,
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (createdUser && stage === 'supabase_auth') {
      await removeProvisionedSupabaseUser(c.env, createdUser).catch(() => undefined);
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => undefined);
    }

    if (isPrismaUniqueConstraintError(error)) return c.json({ error: 'ACCOUNT_EXISTS' }, 409);
    if (stage === 'supabase_auth') return c.json({ error: 'AUTH_PROVIDER_UNAVAILABLE' }, 503);
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
    // Legacy Prisma credentials remain valid during the migration. Once they
    // pass verification, issueSupabaseSession JIT-provisions/synchronizes the
    // corresponding Supabase Auth account and returns mobile-persistent tokens.
    const session = await issueSupabaseSession(c.env, user, input.password);
    const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
    return c.json({ user: toPublicUser(user), session, rewards: { dailyPackGranted } });
  } catch (error) {
    console.error('[auth.login] Supabase session issue failed', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: 'AUTH_PROVIDER_UNAVAILABLE' }, 503);
  }
});

auth.get('/me', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'));
  if (!token) return c.json({ error: 'UNAUTHORIZED' }, 401);

  const prisma = c.get('prisma');
  const user = await getBearerUser(prisma, c.env, token).catch((error) => {
    console.error('[auth.me] bearer validation failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (!user) return c.json({ error: 'UNAUTHORIZED' }, 401);

  const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);
  return c.json({ user, rewards: { dailyPackGranted } });
});

// Session revocation is handled by the Supabase Auth client through the
// restricted /api/supabase/auth/v1/logout proxy. Keep this endpoint harmless
// for stale clients, but never create/read a browser cookie again.
auth.post('/logout', (c) => c.body(null, 204));

// The old Google callback created a cookie-only session and is deliberately
// disabled until it is migrated to the same bearer-token contract.
auth.get('/google', (c) => c.json({ error: 'GOOGLE_LOGIN_TEMPORARILY_DISABLED' }, 410));
auth.get('/google/callback', (c) => c.json({ error: 'GOOGLE_LOGIN_TEMPORARILY_DISABLED' }, 410));

export { auth };
