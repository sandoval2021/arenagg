import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Env } from '../types/env';
import { resolveBearerUser } from '../services/supabase-auth.service';
import { authenticatedUser, COOKIE } from '../d1/native-auth.routes';

function readBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  // D1 sessions are owned by the first-party HttpOnly cookie, never by
  // Supabase Auth. The request-scoped DB binding identifies the new runtime.
  if (c.env.DB) {
    const token = getCookie(c, COOKIE);
    if (!token) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão ausente ou expirada.' }, 401);
    const user = await authenticatedUser(c.env.DB, token);
    if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }, 401);
    c.set('user', {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });
    await next();
    return;
  }

  // Preserve old behavior for non-D1 deployments until the migration is
  // complete. Production is not switched by this change.
  const token = readBearerToken(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão ausente ou expirada.' }, 401);

  const user = await resolveBearerUser(c.env, c.get('prisma'), token);
  if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }, 401);

  c.set('user', user);
  await next();
});
