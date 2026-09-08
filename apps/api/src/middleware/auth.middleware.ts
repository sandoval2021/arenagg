import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types/env';
import { getSessionUser } from '../services/auth.service';

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const token = getCookie(c, 'chavea_session');
  if (!token) return c.json({ error: 'UNAUTHORIZED' }, 401);
  const user = await getSessionUser(c.get('prisma'), token);
  if (!user) return c.json({ error: 'UNAUTHORIZED' }, 401);
  c.set('user', user);
  await next();
});
