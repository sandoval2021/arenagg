import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Env } from '../types/env';
import { createSession, getSessionUser, hashPassword, normalizeEmail, normalizePhone, revokeSession, toPublicUser, verifyPassword } from '../services/auth.service';

const auth = new Hono<Env>();
const password = z.string().min(10).max(128);
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().optional(), phone: z.string().min(8).max(24).optional(), password }).refine((v) => Boolean(v.email) !== Boolean(v.phone), 'Provide exactly one identifier');
const loginSchema = z.object({ email: z.string().email().optional(), phone: z.string().min(8).max(24).optional(), password }).refine((v) => Boolean(v.email) !== Boolean(v.phone), 'Provide exactly one identifier');
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'Lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };

function parse<T>(schema: z.ZodType<T>, body: unknown): T | null { const result = schema.safeParse(body); return result.success ? result.data : null; }
async function attachSession(c: Parameters<typeof setCookie>[0], prisma: Env['Variables']['prisma'], userId: string) { const session = await createSession(prisma, userId); setCookie(c, 'chavea_session', session.token, cookieOptions); }

auth.post('/register', async (c) => {
  const input = parse(registerSchema, await c.req.json().catch(() => null)); if (!input) return c.json({ error: 'INVALID_INPUT' }, 400);
  const email = input.email ? normalizeEmail(input.email) : null; const phone = input.phone ? normalizePhone(input.phone) : null; const prisma = c.get('prisma');
  const existing = await prisma.user.findFirst({ where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] } }); if (existing) return c.json({ error: 'ACCOUNT_EXISTS' }, 409);
  const user = await prisma.user.create({ data: { name: input.name, email, phone, passwordHash: await hashPassword(input.password) } }); await attachSession(c, prisma, user.id); return c.json({ user: toPublicUser(user) }, 201);
});

auth.post('/login', async (c) => {
  const input = parse(loginSchema, await c.req.json().catch(() => null)); if (!input) return c.json({ error: 'INVALID_INPUT' }, 400);
  const prisma = c.get('prisma'); const user = input.email ? await prisma.user.findUnique({ where: { email: normalizeEmail(input.email) } }) : await prisma.user.findUnique({ where: { phone: normalizePhone(input.phone!) } });
  if (!user?.passwordHash || !user.isActive || !(await verifyPassword(user.passwordHash, input.password))) return c.json({ error: 'INVALID_CREDENTIALS' }, 401);
  await attachSession(c, prisma, user.id); return c.json({ user: toPublicUser(user) });
});

auth.get('/me', async (c) => { const token = getCookie(c, 'chavea_session'); if (!token) return c.json({ user: null }); return c.json({ user: await getSessionUser(c.get('prisma'), token) }); });
auth.post('/logout', async (c) => { const token = getCookie(c, 'chavea_session'); if (token) await revokeSession(c.get('prisma'), token); deleteCookie(c, 'chavea_session', { path: '/', secure: true }); return c.body(null, 204); });

auth.get('/google', (c) => { const state = crypto.randomUUID(); setCookie(c, 'chavea_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 }); const url = new URL('https://accounts.google.com/o/oauth2/v2/auth'); url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID); url.searchParams.set('redirect_uri', c.env.GOOGLE_REDIRECT_URI); url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', 'openid email profile'); url.searchParams.set('state', state); url.searchParams.set('prompt', 'select_account'); return c.redirect(url.toString()); });

auth.get('/google/callback', async (c) => {
  const code = c.req.query('code'), state = c.req.query('state'), expected = getCookie(c, 'chavea_oauth_state'); if (!code || !state || !expected || state !== expected) return c.json({ error: 'INVALID_OAUTH_STATE' }, 400);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID, client_secret: c.env.GOOGLE_CLIENT_SECRET, redirect_uri: c.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }) }); if (!tokenResponse.ok) return c.json({ error: 'OAUTH_TOKEN_EXCHANGE_FAILED' }, 401);
  const tokens = await tokenResponse.json<{ access_token: string }>(); const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } }); if (!profileResponse.ok) return c.json({ error: 'OAUTH_PROFILE_FAILED' }, 401);
  const profile = await profileResponse.json<{ sub: string; email: string; email_verified?: boolean; name?: string; picture?: string }>(); if (!profile.email || !profile.email_verified) return c.json({ error: 'GOOGLE_EMAIL_NOT_VERIFIED' }, 401);
  const prisma = c.get('prisma'); const email = normalizeEmail(profile.email); let user = await prisma.user.findUnique({ where: { email } }); if (!user) user = await prisma.user.create({ data: { name: profile.name ?? email.split('@')[0], email, emailVerified: new Date(), avatarUrl: profile.picture } });
  await prisma.authAccount.upsert({ where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.sub } }, create: { userId: user.id, provider: 'google', providerAccountId: profile.sub }, update: { userId: user.id } }); await attachSession(c, prisma, user.id); deleteCookie(c, 'chavea_oauth_state', { path: '/' }); return c.redirect(c.env.WEB_APP_URL);
});

export { auth };
