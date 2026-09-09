import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { BADGE_CATALOG } from '../domain/achievements/badges';
import { resolveRank } from '../domain/ranking/ranks';
import { reconcileRareAchievements } from '../services/achievement-reconciliation.service';

export const gamification = new Hono<Env>();

const ranksSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
});

gamification.get('/achievements', (c) => c.json(BADGE_CATALOG));

gamification.post('/ranks', async (c) => {
  const parsed = ranksSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT' }, 400);
  const userIds = [...new Set(parsed.data.userIds)];
  const profiles = await c.get('prisma').userProfile.findMany({
    where: { userId: { in: userIds }, user: { isActive: true } },
    select: { userId: true, mmr: true },
  });
  const byId = new Map(profiles.map((profile) => [profile.userId, profile.mmr]));
  return c.json(userIds.map((userId) => {
    const mmr = byId.get(userId) ?? 1500;
    return { userId, mmr, rank: resolveRank(mmr) };
  }));
});

// Reavalia só gatilhos raros/temporais do próprio usuário. Não percorre
// histórico de partidas; cinco leituras indexadas e um único lote de badges.
gamification.post('/refresh', async (c) => {
  const db = c.get('prisma');
  const userId = c.get('user').id;
  await reconcileRareAchievements(db, userId);
  return c.json({ ok: true });
});
