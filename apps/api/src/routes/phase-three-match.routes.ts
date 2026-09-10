import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';
import { resolveWinner } from '../domain/bracket/knockout';
import { applyFinishedMatchToProfiles } from '../services/profile-stats.service';
import { awardCheckinBadge } from '../services/achievement-engine.service';
import { sendPushToUsers } from '../services/push.service';
import {
  InvalidMatchTransitionError,
  transitionMatch,
  type MatchState,
} from '@chavea/domain/match/states';

export const phaseThreeMatches = new Hono<Env>();

type Tx = Prisma.TransactionClient;

type AdvanceableMatch = {
  competition: { type: string };
  nextMatchId: string | null;
  nextMatchSlot: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
};

const matchAccessInclude = {
  competition: { select: { hostId: true, type: true, name: true } },
  homeTeam: { select: { id: true, participation: { select: { userId: true } } } },
  awayTeam: { select: { id: true, participation: { select: { userId: true } } } },
} satisfies Prisma.MatchInclude;

const walkoverSchema = z.object({
  winner: z.enum(['AUTO', 'HOME', 'AWAY']).default('AUTO'),
  version: z.coerce.number().int().min(1),
});

async function lockMatch(tx: Tx, matchId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${matchId}))`;
}

async function advance(tx: Tx, match: AdvanceableMatch): Promise<void> {
  if (!match.nextMatchId || !match.nextMatchSlot) return;
  if (!match.homeTeamId || !match.awayTeamId || match.homeScore == null || match.awayScore == null) return;
  const winnerId = resolveWinner({
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homePenaltyScore: match.homePenaltyScore,
    awayPenaltyScore: match.awayPenaltyScore,
  });
  await tx.match.update({
    where: { id: match.nextMatchId },
    data: match.nextMatchSlot === 'HOME' ? { homeTeamId: winnerId } : { awayTeamId: winnerId },
  });
}

phaseThreeMatches.post('/:id/ready', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const matchId = c.req.param('id');

  const result = await db.$transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const match = await tx.match.findUnique({ where: { id: matchId }, include: matchAccessInclude });
    if (!match) return { error: 'MATCH_NOT_FOUND' as const };
    if (match.status === 'FINISHED' || match.status === 'CANCELED') return { error: 'MATCH_NOT_OPEN' as const };
    if (!match.homeTeam || !match.awayTeam) return { error: 'MATCH_NOT_READY' as const };

    const side = match.homeTeam.participation.userId === user.id
      ? 'HOME' as const
      : match.awayTeam.participation.userId === user.id
        ? 'AWAY' as const
        : null;
    if (!side) return { error: 'PLAYER_ONLY' as const };

    if ((side === 'HOME' && match.homeReady) || (side === 'AWAY' && match.awayReady)) {
      return {
        ready: { homeReady: match.homeReady, awayReady: match.awayReady, homeReadyAt: match.homeReadyAt, awayReadyAt: match.awayReadyAt },
        notifyUserId: null,
        competitionId: match.competitionId,
        competitionName: match.competition.name,
      };
    }

    const now = new Date();
    const changed = await tx.match.updateMany({
      where: { id: matchId, status: { notIn: ['FINISHED', 'CANCELED'] } },
      data: side === 'HOME' ? { homeReady: true, homeReadyAt: now } : { awayReady: true, awayReadyAt: now },
    });
    if (changed.count !== 1) return { error: 'MATCH_NOT_OPEN' as const };

    const ready = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      select: { homeReady: true, awayReady: true, homeReadyAt: true, awayReadyAt: true },
    });
    const notifyUserId = side === 'HOME' ? match.awayTeam.participation.userId : match.homeTeam.participation.userId;
    return { ready, notifyUserId, competitionId: match.competitionId, competitionName: match.competition.name };
  });

  if ('error' in result) {
    const status = result.error === 'MATCH_NOT_FOUND' ? 404 : result.error === 'PLAYER_ONLY' ? 403 : 409;
    return c.json({ error: result.error }, status);
  }

  await awardCheckinBadge(db, user.id);
  if (result.notifyUserId) {
    try {
      await sendPushToUsers(db, c.env, [result.notifyUserId], {
        title: '🎮 Seu adversário fez Check-in',
        body: `${result.competitionName}: ele já confirmou que está pronto para jogar.`,
        url: `/competitions/${result.competitionId}`,
        tag: `match-ready-${matchId}`,
      });
    } catch (error) {
      console.warn('[push] ready notification failed', error);
    }
  }
  return c.json(result.ready);
});

phaseThreeMatches.post('/:id/walkover', async (c) => {
  const parsed = walkoverSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const matchId = c.req.param('id');

  try {
    const result = await db.$transaction(async (tx) => {
      await lockMatch(tx, matchId);
      const match = await tx.match.findUnique({ where: { id: matchId }, include: matchAccessInclude });
      if (!match) return { error: 'MATCH_NOT_FOUND' as const };
      if (match.competition.hostId !== user.id) return { error: 'HOST_ONLY' as const };
      if (!match.homeTeam || !match.awayTeam) return { error: 'MATCH_NOT_READY' as const };

      const nextState = transitionMatch(match.status as MatchState, 'HOST_WALKOVER');
      let winnerSide: 'HOME' | 'AWAY' | null = parsed.data.winner === 'AUTO' ? null : parsed.data.winner;
      if (!winnerSide) {
        if (match.homeReady === match.awayReady) return { error: 'WALKOVER_WINNER_REQUIRED' as const };
        winnerSide = match.homeReady ? 'HOME' : 'AWAY';
      }

      const winnerTeamId = winnerSide === 'HOME' ? match.homeTeam.id : match.awayTeam.id;
      const winnerUserId = winnerSide === 'HOME' ? match.homeTeam.participation.userId : match.awayTeam.participation.userId;
      const now = new Date();
      const changed = await tx.match.updateMany({
        where: { id: matchId, version: parsed.data.version, status: match.status },
        data: {
          status: nextState,
          homeScore: winnerSide === 'HOME' ? 3 : 0,
          awayScore: winnerSide === 'AWAY' ? 3 : 0,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          walkoverWinnerTeamId: winnerTeamId,
          walkoverAppliedAt: now,
          walkoverAppliedById: user.id,
          submittedById: user.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('VERSION_CONFLICT');

      await Promise.all([
        tx.matchScorer.deleteMany({ where: { matchId } }),
        tx.matchStats.deleteMany({ where: { matchId } }),
      ]);

      const fresh = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { competition: { select: { type: true } } } });
      await advance(tx, fresh);
      await applyFinishedMatchToProfiles(tx, matchId);

      return {
        match: {
          id: fresh.id,
          status: fresh.status,
          version: fresh.version,
          homeScore: fresh.homeScore,
          awayScore: fresh.awayScore,
          homeReady: fresh.homeReady,
          awayReady: fresh.awayReady,
          walkoverWinnerTeamId: fresh.walkoverWinnerTeamId,
          walkoverAppliedAt: fresh.walkoverAppliedAt,
        },
        winnerUserId,
        competitionId: match.competitionId,
        competitionName: match.competition.name,
      };
    });

    if ('error' in result) {
      const status = result.error === 'MATCH_NOT_FOUND' ? 404 : result.error === 'HOST_ONLY' ? 403 : 409;
      return c.json({ error: result.error }, status);
    }

    try {
      await sendPushToUsers(db, c.env, [result.winnerUserId], {
        title: '⚡ Você recebeu um W.O.',
        body: `${result.competitionName}: vitória automática por 3×0 confirmada pelo Host.`,
        url: `/competitions/${result.competitionId}`,
        tag: `walkover-${matchId}`,
      });
    } catch (error) {
      console.warn('[push] walkover notification failed', error);
    }
    return c.json(result.match);
  } catch (error) {
    if (error instanceof InvalidMatchTransitionError) {
      return c.json({ error: 'INVALID_MATCH_TRANSITION', message: error.message }, 409);
    }
    throw error;
  }
});
