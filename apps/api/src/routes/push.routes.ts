import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { getVapidPublicKey, isPushConfigured } from '../services/push.service';

export const push = new Hono<Env>();

const MAX_SUBSCRIPTIONS_PER_USER = 8;

const endpointSchema = z
  .string()
  .trim()
  .max(4096)
  .url()
  .refine((value) => value.startsWith('https://'), 'Push endpoint must use HTTPS')
  .refine((value) => {
    try {
      const host = new URL(value).hostname.toLowerCase();
      if (host === 'localhost' || host.endsWith('.local')) return false;
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;
      if (host === '::1' || host.startsWith('[')) return false;
      return true;
    } catch {
      return false;
    }
  }, 'Invalid push endpoint host');

const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  p256dh: z.string().trim().min(32).max(512),
  auth: z.string().trim().min(8).max(256),
  userAgent: z.string().trim().max(512).optional(),
});

push.get('/public-key', (c) => {
  const publicKey = getVapidPublicKey(c.env);
  return c.json({ configured: isPushConfigured(c.env), publicKey });
});

push.get('/status', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const count = await db.pushSubscription.count({ where: { userId: user.id } });
  return c.json({ configured: isPushConfigured(c.env), subscriptionCount: count });
});

push.post('/subscriptions', async (c) => {
  const parsed = subscriptionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_PUSH_SUBSCRIPTION', issues: parsed.error.flatten() }, 400);
  if (!isPushConfigured(c.env)) return c.json({ error: 'PUSH_NOT_CONFIGURED' }, 503);

  const db = c.get('prisma');
  const user = c.get('user');
  const input = parsed.data;

  const saved = await db.$transaction(async (tx) => {
    const subscription = await tx.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      },
      update: {
        userId: user.id,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      },
      select: { id: true, endpoint: true, updatedAt: true },
    });

    const stale = await tx.pushSubscription.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      skip: MAX_SUBSCRIPTIONS_PER_USER,
      select: { id: true },
    });
    if (stale.length > 0) {
      await tx.pushSubscription.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
    }
    return subscription;
  });

  return c.json({ id: saved.id, active: true });
});

push.delete('/subscriptions', async (c) => {
  const parsed = z.object({ endpoint: endpointSchema }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_PUSH_SUBSCRIPTION' }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  await db.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: user.id },
  });
  return c.body(null, 204);
});
