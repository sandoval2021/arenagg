import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { hashPassword, normalizeEmail } from '../services/auth.service';

const resetPasswordSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(10).max(128),
});

export const devAuth = new Hono<Env>();

// TODO(SECURITY): remove this route as soon as transactional email recovery is
// available. A public reset-by-email endpoint would allow account takeover, so
// this temporary development route is fail-closed behind a server-side secret.
devAuth.post('/reset-password-dev', async (c) => {
  const expectedToken = c.env.DEV_PASSWORD_RESET_TOKEN;
  if (!expectedToken) return c.json({ error: 'DEV_RESET_DISABLED' }, 404);

  const suppliedToken = c.req.header('X-Dev-Reset-Token');
  if (!suppliedToken || suppliedToken !== expectedToken) {
    return c.json({ error: 'DEV_RESET_FORBIDDEN' }, 403);
  }

  const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);
  }

  const email = normalizeEmail(parsed.data.email);
  const db = c.get('prisma');
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return c.json({ error: 'ACCOUNT_NOT_FOUND' }, 404);

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId: user.id } }),
  ]);

  console.log('[auth.reset-password-dev] password reset completed', { userId: user.id });
  return c.json({ ok: true });
});
