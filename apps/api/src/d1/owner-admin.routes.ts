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
    const statement = c.env.DB.prepare(`
      SELECT "id", "name", "email", "phone", "role", "isActive",
             "emailVerified", "createdAt"
      FROM "User"
      ORDER BY "createdAt" DESC LIMIT ?1 OFFSET ?2
    `).bind(30, offset);
    // Explicit 'all' avoids unstable provider-specific query fields.
    const records: Array<Record<string, unknown>> = [];
    // The statement port intentionally exposes only first()/run() until all()
    // is added and tested; do not return a fabricated account list.
    void statement;
    return c.json({ error: 'ADMIN_USERS_NOT_YET_MIGRATED', users: records }, 501);
  } catch {
    return c.json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  }
});
