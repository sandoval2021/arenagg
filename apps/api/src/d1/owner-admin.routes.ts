import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { authenticatedUser, COOKIE, type D1DatabasePort } from './native-auth.routes';

type Bindings = {
  DB: D1DatabasePort;
  OWNER_EMAIL?: string;
};
type AdminEnv = { Bindings: Bindings };

export const ownerAdminRoutes = new Hono<AdminEnv>();

ownerAdminRoutes.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ error: 'UNAUTHORIZED' }, 401);
  const user = await authenticatedUser(c.env.DB, token).catch(() => null);
  if (!user) return c.json({ error: 'UNAUTHORIZED' }, 401);
  // Fail closed: never authorize by email alone or a UI-provided claim.
  // A verified identity, ADMIN role, and configured owner address are all
  // required for the single-account owner console.
  if (!user.emailVerified || user.role !== 'ADMIN' ||
      !user.email || !c.env.OWNER_EMAIL ||
      user.email.trim().toLowerCase() !== c.env.OWNER_EMAIL.trim().toLowerCase()) {
    return c.json({ error: 'ADMIN_ONLY' }, 403);
  }
  await next();
});

ownerAdminRoutes.get('/overview', async c => {
  try {
    const db = c.env.DB;
    const count = async (table: '"User"' | '"Competition"' | '"Match"') => {
      const row = await db.prepare('SELECT COUNT(*) AS total FROM ' + table).first<{ total: number }>();
      return row?.total ?? 0;
    };
    const [users, competitions, matches] = await Promise.all([
      count('"User"'), count('"Competition"'), count('"Match"'),
    ]);
    return c.json({ users, competitions, matches, backend: 'cloudflare-d1' });
  } catch {
    return c.json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  }
});

ownerAdminRoutes.get('/users', async c => {
  const rawOffset = Number(c.req.query('offset') ?? '0');
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0
    ? Math.min(rawOffset, 100000) : 0;
  try {
    const response = await c.env.DB.prepare(`
      SELECT "id", "name", "email", "phone", "role", "isActive",
             "emailVerified", "createdAt"
      FROM "User"
      ORDER BY "createdAt" DESC LIMIT ?1 OFFSET ?2
    `).bind(30, offset).all<{
      id: string; name: string; email: string | null; phone: string | null;
      role: string; isActive: number | boolean; emailVerified: string | null;
      createdAt: string;
    }>();
    return c.json({
      users: response.results.map(row => ({
        ...row,
        isActive: Boolean(row.isActive),
        emailVerified: Boolean(row.emailVerified),
      })),
      offset, limit: 30,
    });
  } catch {
    return c.json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  }
});

ownerAdminRoutes.patch('/users/:userId', async c => {
  const userId = c.req.param('userId');
  if (!/^[a-f0-9-]{36}$/i.test(userId)) {
    return c.json({ error: 'INVALID_USER' }, 400);
  }
  const input = await c.req.json().catch(() => null) as { isActive?: unknown } | null;
  if (typeof input?.isActive !== 'boolean') return c.json({ error: 'INVALID_INPUT' }, 400);

  // Never disable or modify the owner account through the user list.
  try {
    const row = await c.env.DB.prepare(
      'SELECT "email", "role" FROM "User" WHERE "id" = ?1',
    ).bind(userId).first<{ email: string | null; role: string }>();
    if (!row) return c.json({ error: 'NOT_FOUND' }, 404);
    if (row.role === 'ADMIN' ||
        row.email?.trim().toLowerCase() === c.env.OWNER_EMAIL?.trim().toLowerCase()) {
      return c.json({ error: 'OWNER_PROTECTED' }, 403);
    }
    await c.env.DB.prepare(
      'UPDATE "User" SET "isActive" = ?1, "updatedAt" = ?2 WHERE "id" = ?3 AND "role" = ?4',
    ).bind(input.isActive ? 1 : 0, new Date().toISOString(), userId, 'USER').run();
    return c.json({ id: userId, isActive: input.isActive });
  } catch {
    return c.json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  }
});
