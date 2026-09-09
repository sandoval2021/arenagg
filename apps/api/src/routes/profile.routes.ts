import { Hono } from 'hono';
import type { Env } from '../types/env';

export const profile = new Hono<Env>();

profile.get('/me', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');

  const stats = await db.userProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
    select: {
      totalWins: true,
      totalDraws: true,
      totalLosses: true,
      totalGoalsScored: true,
      totalGoalsConceded: true,
      championshipsWon: true,
    },
  });

  return c.json(stats);
});
