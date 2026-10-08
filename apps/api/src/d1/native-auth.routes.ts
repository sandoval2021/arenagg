import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { hashPassword, normalizeEmail, normalizePhone, verifyPassword } from '../services/auth.service';

/**
 * Independent D1-native auth module. Not mounted in the production PostgreSQL
 * API. No Supabase SDK, TCP connection or persistent plaintext bearer tokens.
 *
 * The Cloudflare Pages first-party /api/* proxy must forward Cookie and
 * Set-Cookie. The browser should use fetch(..., { credentials: 'same-origin' }).
 */
type D1Value = string | number | boolean | null | ArrayBuffer | Uint8Array;
interface StatementPort {
  bind(...params: D1Value[]): StatementPort;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
}
export interface D1DatabasePort {
  prepare(sql: string): StatementPort;
  batch(statements: StatementPort[]): Promise<unknown>;
}

type Bindings = { DB: D1DatabasePort; WEB_APP_URL?: string };
type D1AuthEnv = { Bindings: Bindings };
type DatabaseUser = {
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  role: 'USER' | 'ADMIN';
  passwordHash: string | null;
  isActive: number | boolean;
};
type PublicUser = Omit<DatabaseUser, 'passwordHash' | 'isActive'>;

const COOKIE = '__Host-chavea_session';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const AUTH_PASSWORD = z.string().min(10).max(128);
const credentialsSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(8).max(24).optional(),
  password: AUTH_PASSWORD,
}).refine(input => Number(Boolean(input.email)) + Number(Boolean(input.phone)) === 1, {
  message: 'Informe e-mail ou telefone, nunca ambos.',
});
const registerSchema = credentialsSchema.and(z.object({
  name: z.string().trim().min(2).max(80),
}));

function toPublicUser(row: DatabaseUser): PublicUser {
  const { passwordHash: _passwordHash, isActive: _isActive, ...publicUser } = row;
  return publicUser;
}
function nowIso(): string { return new Date().toISOString(); }
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export function sendCookie(c: Context<D1AuthEnv>, token: string): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
}
export async function createSession(db: D1DatabasePort, userId: string): Promise<string> {
  const token = randomToken();
  const issued = new Date();
  const expires = new Date(issued.getTime() + SESSION_TTL_SEC * 1_000).toISOString();
  await db.prepare(`
    INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt", "createdAt", "lastUsedAt")
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(crypto.randomUUID(), userId, await hashToken(token), expires, issued.toISOString(), issued.toISOString()).run();
  return token;
}
async function readUser(db: D1DatabasePort, identifier: { email?: string; phone?: string }): Promise<DatabaseUser | null> {
  const byEmail = Boolean(identifier.email);
  const value = byEmail ? normalizeEmail(identifier.email!) : normalizePhone(identifier.phone!);
  return db.prepare(`
    SELECT "id", "name", "displayName", "avatarUrl", "email", "phone", "role", "passwordHash", "isActive"
    FROM "User" WHERE ${byEmail ? '"email"' : '"phone"'} = ?1 LIMIT 1
  `).bind(value).first<DatabaseUser>();
}
async function authenticatedUser(db: D1DatabasePort, token: string): Promise<DatabaseUser | null> {
  if (token.length < 32 || token.length > 128) return null;
  const session = await db.prepare(`
    SELECT s."id", s."expiresAt", s."lastUsedAt",
      u."id" AS "userId", u."name", u."displayName", u."avatarUrl",
      u."email", u."phone", u."role", u."passwordHash", u."isActive"
    FROM "Session" s JOIN "User" u ON s."userId" = u."id"
    WHERE s."tokenHash" = ?1 LIMIT 1
  `).bind(await hashToken(token)).first<DatabaseUser & {
    userId: string; expiresAt: string; lastUsedAt: string;
  }>();
  if (!session) return null;
  if (!session.isActive || !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now()) {
    return null;
  }
  if (Date.now() - Date.parse(session.lastUsedAt) > 5 * 60 * 1_000) {
    const renewedExpiry = new Date(Date.now() + SESSION_TTL_SEC * 1_000).toISOString();
    await db.prepare(`
      UPDATE "Session" SET "lastUsedAt" = ?1, "expiresAt" = ?2 WHERE "tokenHash" = ?3
    `).bind(nowIso(), renewedExpiry, await hashToken(token)).run();
  }
  return {
    id: session.userId, name: session.name, displayName: session.displayName,
    avatarUrl: session.avatarUrl, email: session.email, phone: session.phone,
    role: session.role, passwordHash: session.passwordHash, isActive: session.isActive,
  };
}

export const routes = new Hono<D1AuthEnv>();

// Deny cross-site authenticated mutations even if cookies are present.
routes.use('*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    const allowed = c.env.WEB_APP_URL || 'https://chavea.pages.dev';
    if (origin && origin !== allowed && origin !== 'http://localhost:5173') {
      return c.json({ error: 'ORIGIN_FORBIDDEN' }, 403);
    }
  }
  c.header('Cache-Control', 'no-store');
  await next();
});

routes.post('/register', async c => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT' }, 400);
  const { name, email, phone, password } = parsed.data;
  const id = crypto.randomUUID();
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const timestamp = nowIso();
  const passwordHash = await hashPassword(password);
  const db = c.env.DB;

  try {
    // D1 batch gives atomicity for the initial User and UserProfile.
    await db.batch([
      db.prepare(`INSERT INTO "User" ("id","name","email","phone","passwordHash","role","isActive","createdAt","updatedAt")
        VALUES (?1,?2,?3,?4,?5,'USER',1,?6,?7)`)
        .bind(id, name, normalizedEmail, normalizedPhone, passwordHash, timestamp, timestamp),
      db.prepare(`INSERT INTO "UserProfile" ("userId","mmr","consoles","createdAt","updatedAt")
        VALUES (?1,1500,'[]',?2,?3)`).bind(id, timestamp, timestamp),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error))) return c.json({ error: 'ACCOUNT_EXISTS' }, 409);
    console.error('[d1.auth.register] write failed', { code: 'DATABASE_WRITE_FAILED' });
    return c.json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  }

  try {
    const token = await createSession(db, id);
    sendCookie(c, token);
    const user = await readUser(db, { ...(normalizedEmail ? { email: normalizedEmail } : { phone: normalizedPhone! }) });
    if (!user) return c.json({ error: 'SESSION_CREATION_FAILED' }, 503);
    return c.json({ user: toPublicUser(user), rewards: { dailyPackGranted: false } }, 201);
  } catch {
    return c.json({ error: 'SESSION_CREATION_FAILED' }, 503);
  }
});

routes.post('/login', async c => {
  const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT' }, 400);
  const { email, phone, password } = parsed.data;
  let user: DatabaseUser | null;
  try {
    user = await readUser(c.env.DB, email ? { email } : { phone });
  } catch {
    return c.json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  }
  if (!user?.passwordHash || !user.isActive || !(await verifyPassword(user.passwordHash, password))) {
    return c.json({ error: 'INVALID_CREDENTIALS' }, 401);
  }
  try {
    sendCookie(c, await createSession(c.env.DB, user.id));
    return c.json({ user: toPublicUser(user), rewards: { dailyPackGranted: false } });
  } catch {
    return c.json({ error: 'SESSION_CREATION_FAILED' }, 503);
  }
});

routes.get('/me', async c => {
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ error: 'UNAUTHORIZED' }, 401);
  try {
    const user = await authenticatedUser(c.env.DB, token);
    if (!user) return c.json({ error: 'UNAUTHORIZED' }, 401);
    return c.json({ user: toPublicUser(user), rewards: { dailyPackGranted: false } });
  } catch {
    return c.json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  }
});

routes.post('/logout', async c => {
  const token = getCookie(c, COOKIE);
  if (token) {
    try {
      await c.env.DB.prepare('DELETE FROM "Session" WHERE "tokenHash" = ?1')
        .bind(await hashToken(token)).run();
    } catch {
      return c.json({ error: 'DATABASE_UNAVAILABLE' }, 503);
    }
  }
  deleteCookie(c, COOKIE, { path: '/', secure: true, sameSite: 'Lax' });
  return c.body(null, 204);
});
