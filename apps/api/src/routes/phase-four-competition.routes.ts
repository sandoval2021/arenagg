import { Hono } from 'hono';
import type { Env } from '../types/env';
import { sendPushToUsers } from '../services/push.service';

export const phaseFourCompetitions = new Hono<Env>();

/**
 * Cross-cutting hook around the existing canonical start route. Notification
 * delivery happens only after a successful transaction/response and remains
 * best-effort, so a push provider outage can never roll back matchmaking.
 */
phaseFourCompetitions.use('/:id/start', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  await next();
  if (!c.res.ok) return;

  try {
    const competitionId = c.req.param('id');
    const db = c.get('prisma');
    const competition = await db.competition.findUnique({
      where: { id: competitionId },
      select: {
        name: true,
        hostId: true,
        participations: {
          where: { status: 'ACTIVE' },
          select: { userId: true },
        },
      },
    });
    if (!competition) return;

    const recipients = competition.participations
      .map((participation) => participation.userId)
      .filter((userId) => userId !== competition.hostId);

    await sendPushToUsers(db, c.env, recipients, {
      title: '🏆 A chave foi gerada!',
      body: `${competition.name}: suas partidas já estão disponíveis.`,
      url: `/competitions/${competitionId}`,
      tag: `competition-start-${competitionId}`,
    });
  } catch (error) {
    console.warn('[push] competition start notification failed', error);
  }
});

phaseFourCompetitions.get('/:id/clips', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');

  const competition = await db.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    select: { id: true },
  });
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const clips = await db.matchMedia.findMany({
    where: {
      match: { competitionId, status: 'FINISHED' },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      url: true,
      platform: true,
      createdAt: true,
      createdById: true,
      match: {
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          round: { select: { number: true, name: true } },
          homeTeam: { select: { id: true, name: true, logoUrl: true } },
          awayTeam: { select: { id: true, name: true, logoUrl: true } },
        },
      },
    },
  });

  return c.json(clips.map((clip) => ({
    ...clip,
    createdAt: clip.createdAt.toISOString(),
  })));
});
