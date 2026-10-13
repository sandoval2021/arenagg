import { createMiddleware } from 'hono/factory';
import type { Env } from '../types/env';
import { isPlatformOwner } from './owner.middleware';

export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  const user = c.get('user');

  if (c.env.DB) {
    if (user.role !== 'ADMIN' || !isPlatformOwner(user.email, c.env.OWNER_EMAIL)) {
      return c.json({ error: 'ADMIN_ONLY' }, 403);
    }
    const verified = await c.env.DB.prepare(
      'SELECT "emailVerified" FROM "User" WHERE "id" = ?1',
    ).bind(user.id).first<{ emailVerified: string | null }>();
    if (!verified?.emailVerified) return c.json({ error: 'OWNER_VERIFICATION_REQUIRED' }, 403);
    await next();
    return;
  }

  if (user.role === 'ADMIN') {
    await next();
    return;
  }

  // Bootstrap safety for an existing deployment where the owner logged in
  // before the role migration was applied. Promote first, then authorize.
  if (isPlatformOwner(user.email, c.env.OWNER_EMAIL)) {
    await c.get('prisma').user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' },
    });
    c.set('user', { ...user, role: 'ADMIN' });
    await next();
    return;
  }

  return c.json({ error: 'ADMIN_ONLY', message: 'Esta ação é exclusiva de administradores.' }, 403);
});
