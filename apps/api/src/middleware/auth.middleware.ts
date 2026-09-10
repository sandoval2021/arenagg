import { createMiddleware } from 'hono/factory';
import type { Env } from '../types/env';
import { extractBearerToken, getBearerUser } from '../services/supabase-auth.service';

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const token = extractBearerToken(c.req.header('authorization'));
  if (!token) return c.json({ error: 'UNAUTHORIZED' }, 401);

  const user = await getBearerUser(c.get('prisma'), c.env, token).catch((error) => {
    console.error('[auth.bearer] token validation failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (!user) return c.json({ error: 'UNAUTHORIZED' }, 401);

  c.set('user', user);
  await next();
});
