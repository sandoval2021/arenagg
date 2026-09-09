import { createMiddleware } from 'hono/factory';
import type { Env } from '../types/env';

export function isPlatformOwner(email: string | null | undefined, ownerEmail: string | undefined): boolean {
  if (!email || !ownerEmail) return false;
  return email.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
}

export const requireOwner = createMiddleware<Env>(async (c, next) => {
  const user = c.get('user');
  if (!isPlatformOwner(user.email, c.env.OWNER_EMAIL)) {
    return c.json({ error: 'OWNER_ONLY' }, 403);
  }
  await next();
});
