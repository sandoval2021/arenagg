import { createMiddleware } from 'hono/factory';
import type { Env } from '../types/env';
import { resolveBearerUser } from '../services/supabase-auth.service';

function readBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const token = readBearerToken(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão ausente ou expirada.' }, 401);

  const user = await resolveBearerUser(c.env, c.get('prisma'), token);
  if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }, 401);

  c.set('user', user);
  await next();
});
