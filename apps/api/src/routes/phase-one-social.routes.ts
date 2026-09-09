import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';

export const headToHead = new Hono<Env>();
export const competitionFeed = new Hono<Env>();

const uuidSchema = z.string().uuid();

function displayName(user: { name: string; displayName: string | null }): string {
  return user.displayName?.trim() || user.name;
}

headToHead.get('/:userId/head-to-head', async (c) => {
  const db = c.get('prisma');
  const viewer = c.get('user');
  const opponentId = c.req.param('userId');

  if (!uuidSchema.safeParse(opponentId).success || opponentId === viewer.id) {
    return c.json({ error: 'HEAD_TO_HEAD_NOT_AVAILABLE' }, 400);
  }

  const opponent = await db.user.findFirst({
    where: { id: opponentId, isActive: true },
    select: { id: true, name: true, displayName: true },
  });
  if (!opponent) return c.json({ error: 'USER_NOT_FOUND' }, 404);

  const teams = await db.team.findMany({
    where: {
      participation: {
        userId: { in: [viewer.id, opponentId] },
      },
    },
    select: {
      id: true,
      participation: { select: { userId: true } },
    },
  });

  const viewerTeamIds = teams
    .filter((team) => team.participation.userId === viewer.id)
    .map((team) => team.id);
  const opponentTeamIds = teams
    .filter((team) => team.participation.userId === opponentId)
    .map((team) => team.id);

  if (viewerTeamIds.length === 0 || opponentTeamIds.length === 0) {
    return c.json({
      viewerWins: 0,
      draws: 0,
      opponentWins: 0,
      totalMatches: 0,
      opponent: { id: opponent.id, name: displayName(opponent) },
      recentMatches: [],
    });
  }

  const matches = await db.match.findMany({
    where: {
      status: 'FINISHED',
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [
        { homeTeamId: { in: viewerTeamIds }, awayTeamId: { in: opponentTeamIds } },
        { homeTeamId: { in: opponentTeamIds }, awayTeamId: { in: viewerTeamIds } },
      ],
    },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      homePenaltyScore: true,
      awayPenaltyScore: true,
      profileAppliedAt: true,
      competition: { select: { id: true, name: true } },
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
    orderBy: { profileAppliedAt: 'desc' },
    take: 100,
  });

  let viewerWins = 0;
  let draws = 0;
  let opponentWins = 0;

  const normalized = matches.map((match) => {
    const viewerIsHome = Boolean(match.homeTeamId && viewerTeamIds.includes(match.homeTeamId));
    const viewerScore = viewerIsHome ? match.homeScore! : match.awayScore!;
    const opponentScore = viewerIsHome ? match.awayScore! : match.homeScore!;
    const viewerPenaltyScore = viewerIsHome ? match.homePenaltyScore : match.awayPenaltyScore;
    const opponentPenaltyScore = viewerIsHome ? match.awayPenaltyScore : match.homePenaltyScore;

    const viewerWon =
      viewerScore > opponentScore
      || (viewerScore === opponentScore
        && viewerPenaltyScore != null
        && opponentPenaltyScore != null
        && viewerPenaltyScore > opponentPenaltyScore);
    const opponentWon =
      opponentScore > viewerScore
      || (viewerScore === opponentScore
        && viewerPenaltyScore != null
        && opponentPenaltyScore != null
        && opponentPenaltyScore > viewerPenaltyScore);

    if (viewerWon) viewerWins += 1;
    else if (opponentWon) opponentWins += 1;
    else draws += 1;

    return {
      id: match.id,
      competitionId: match.competition.id,
      competitionName: match.competition.name,
      occurredAt: match.profileAppliedAt?.toISOString() ?? null,
      viewerScore,
      opponentScore,
      viewerPenaltyScore,
      opponentPenaltyScore,
      result: viewerWon ? 'WIN' as const : opponentWon ? 'LOSS' as const : 'DRAW' as const,
      viewerTeam: viewerIsHome ? match.homeTeam : match.awayTeam,
      opponentTeam: viewerIsHome ? match.awayTeam : match.homeTeam,
    };
  });

  return c.json({
    viewerWins,
    draws,
    opponentWins,
    totalMatches: matches.length,
    opponent: { id: opponent.id, name: displayName(opponent) },
    recentMatches: normalized.slice(0, 5),
  });
});

competitionFeed.get('/:id/feed', async (c) => {
  const db = c.get('prisma');
  const viewer = c.get('user');
  const competitionId = c.req.param('id');

  if (!uuidSchema.safeParse(competitionId).success) {
    return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);
  }

  const competition = await db.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { hostId: viewer.id },
        { participations: { some: { userId: viewer.id, status: 'ACTIVE' } } },
      ],
    },
    select: { id: true, name: true },
  });
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const [participations, matches] = await Promise.all([
    db.participation.findMany({
      where: { competitionId, status: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        joinedAt: true,
        teamName: true,
        teamLogoUrl: true,
        user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        team: { select: { name: true, logoUrl: true } },
      },
    }),
    db.match.findMany({
      where: {
        competitionId,
        status: 'FINISHED',
        homeScore: { not: null },
        awayScore: { not: null },
        profileAppliedAt: { not: null },
      },
      orderBy: { profileAppliedAt: 'desc' },
      take: 60,
      select: {
        id: true,
        profileAppliedAt: true,
        homeScore: true,
        awayScore: true,
        homePenaltyScore: true,
        awayPenaltyScore: true,
        homeTeam: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            participation: {
              select: {
                user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
              },
            },
          },
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            participation: {
              select: {
                user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const joinItems = participations.map((participation) => ({
    id: `join:${participation.id}`,
    type: 'JOIN' as const,
    occurredAt: participation.joinedAt.toISOString(),
    user: {
      id: participation.user.id,
      name: displayName(participation.user),
      avatarUrl: participation.user.avatarUrl,
    },
    team: {
      name: participation.team?.name ?? participation.teamName,
      logoUrl: participation.team?.logoUrl ?? participation.teamLogoUrl,
    },
  }));

  const matchItems = matches.flatMap((match) => {
    if (!match.homeTeam || !match.awayTeam || match.homeScore == null || match.awayScore == null || !match.profileAppliedAt) {
      return [];
    }

    const tied = match.homeScore === match.awayScore;
    const homePenaltyWin = tied
      && match.homePenaltyScore != null
      && match.awayPenaltyScore != null
      && match.homePenaltyScore > match.awayPenaltyScore;
    const awayPenaltyWin = tied
      && match.homePenaltyScore != null
      && match.awayPenaltyScore != null
      && match.awayPenaltyScore > match.homePenaltyScore;
    const homeWon = match.homeScore > match.awayScore || homePenaltyWin;
    const awayWon = match.awayScore > match.homeScore || awayPenaltyWin;
    const goalDifference = Math.abs(match.homeScore - match.awayScore);
    const blowout = (homeWon || awayWon) && goalDifference >= 3;

    return [{
      id: `match:${match.id}`,
      type: 'MATCH_RESULT' as const,
      occurredAt: match.profileAppliedAt.toISOString(),
      tone: blowout ? 'BLOWOUT' as const : homeWon || awayWon ? 'WIN' as const : 'DRAW' as const,
      home: {
        userId: match.homeTeam.participation.user.id,
        playerName: displayName(match.homeTeam.participation.user),
        teamName: match.homeTeam.name,
        logoUrl: match.homeTeam.logoUrl,
        score: match.homeScore,
        penaltyScore: match.homePenaltyScore,
      },
      away: {
        userId: match.awayTeam.participation.user.id,
        playerName: displayName(match.awayTeam.participation.user),
        teamName: match.awayTeam.name,
        logoUrl: match.awayTeam.logoUrl,
        score: match.awayScore,
        penaltyScore: match.awayPenaltyScore,
      },
      winnerSide: homeWon ? 'HOME' as const : awayWon ? 'AWAY' as const : null,
    }];
  });

  const items = [...joinItems, ...matchItems]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 80);

  return c.json({ competitionId, items });
});
