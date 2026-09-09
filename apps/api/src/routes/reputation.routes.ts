import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';

export const reputation = new Hono<Env>();

const reputationTag = z.enum(['RAGE_QUITTER', 'TOXIC', 'FAIR_PLAY']);
const reviewSchema = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  tags: z.array(reputationTag).max(3).default([]).transform((values) => [...new Set(values)]),
});

reputation.get('/pending/:competitionId', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('competitionId');

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

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const match = await db.match.findFirst({
    where: {
      competitionId,
      status: 'FINISHED',
      profileAppliedAt: { gte: since },
      OR: [
        { homeTeam: { participation: { userId: user.id } } },
        { awayTeam: { participation: { userId: user.id } } },
      ],
      reviews: { none: { reviewerId: user.id } },
    },
    orderBy: { profileAppliedAt: 'desc' },
    select: {
      id: true,
      profileAppliedAt: true,
      homeTeam: {
        select: {
          id: true,
          name: true,
          participation: {
            select: {
              userId: true,
              user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
            },
          },
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          participation: {
            select: {
              userId: true,
              user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!match?.homeTeam || !match.awayTeam) return c.json(null);
  const opponent = match.homeTeam.participation.userId === user.id
    ? match.awayTeam
    : match.homeTeam;

  return c.json({
    matchId: match.id,
    finishedAt: match.profileAppliedAt?.toISOString() ?? null,
    opponent: {
      id: opponent.participation.user.id,
      name: opponent.participation.user.displayName ?? opponent.participation.user.name,
      avatarUrl: opponent.participation.user.avatarUrl,
      teamName: opponent.name,
    },
  });
});

reputation.post('/:matchId', async (c) => {
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_REVIEW', issues: parsed.error.flatten() }, 400);

  const db = c.get('prisma');
  const reviewer = c.get('user');
  const matchId = c.req.param('matchId');
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      homeTeam: { select: { participation: { select: { userId: true } } } },
      awayTeam: { select: { participation: { select: { userId: true } } } },
    },
  });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  if (match.status !== 'FINISHED') return c.json({ error: 'MATCH_NOT_FINISHED' }, 409);

  const homeUserId = match.homeTeam?.participation.userId;
  const awayUserId = match.awayTeam?.participation.userId;
  if (!homeUserId || !awayUserId) return c.json({ error: 'MATCH_PLAYERS_NOT_READY' }, 409);
  const reviewedId = homeUserId === reviewer.id ? awayUserId : awayUserId === reviewer.id ? homeUserId : null;
  if (!reviewedId) return c.json({ error: 'PLAYER_ONLY' }, 403);

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`reputation:${reviewedId}`}))`;

    const existing = await tx.userReview.findUnique({
      where: { matchId_reviewerId: { matchId, reviewerId: reviewer.id } },
      select: { id: true, stars: true, tags: true, createdAt: true },
    });
    if (existing) return { review: existing, created: false as const };

    const review = await tx.userReview.create({
      data: {
        matchId,
        reviewerId: reviewer.id,
        reviewedId,
        stars: parsed.data.stars,
        tags: parsed.data.tags,
      },
      select: { id: true, stars: true, tags: true, createdAt: true },
    });

    const aggregate = await tx.userReview.aggregate({
      where: { reviewedId },
      _avg: { stars: true },
      _count: { _all: true },
    });
    await tx.userProfile.upsert({
      where: { userId: reviewedId },
      create: {
        userId: reviewedId,
        reputationAverage: aggregate._avg.stars ?? 0,
        reputationCount: aggregate._count._all,
      },
      update: {
        reputationAverage: aggregate._avg.stars ?? 0,
        reputationCount: aggregate._count._all,
      },
    });

    return { review, created: true as const };
  });

  return c.json({
    ...result.review,
    createdAt: result.review.createdAt.toISOString(),
  }, result.created ? 201 : 200);
});
