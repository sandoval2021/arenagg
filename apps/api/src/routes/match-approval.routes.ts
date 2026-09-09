import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';
import { resolveWinner } from '../domain/bracket/knockout';
import { applyFinishedMatchToProfiles } from '../services/profile-stats.service';
import { sendPushToUsers } from '../services/push.service';
import { transitionMatch, type MatchState } from '@chavea/domain/match/states';

export const matchApproval = new Hono<Env>();

const approveSchema = z.object({ version: z.coerce.number().int().positive() });

const include = {
  competition: { select: { hostId: true, name: true, type: true, entryFee: true, firstPrize: true, secondPrize: true, thirdPrize: true } },
  homeTeam: { select: { participation: { select: { userId: true } } } },
  awayTeam: { select: { participation: { select: { userId: true } } } },
} satisfies Prisma.MatchInclude;

function prizeBacked(match: Prisma.MatchGetPayload<{ include: typeof include }>): boolean {
  return match.competition.entryFee > 0 || Boolean(match.competition.firstPrize || match.competition.secondPrize || match.competition.thirdPrize);
}

async function advance(tx: Prisma.TransactionClient, match: {
  competition: { type: string };
  nextMatchId: string | null;
  nextMatchSlot: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
}) {
  if (match.competition.type === 'LEAGUE' || !match.nextMatchId || !match.nextMatchSlot) return;
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

matchApproval.post('/:id/approve', async (c) => {
  const parsed = approveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT' }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const matchId = c.req.param('id');
  const match = await db.match.findUnique({ where: { id: matchId }, include });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  const homeUserId = match.homeTeam?.participation.userId;
  const awayUserId = match.awayTeam?.participation.userId;
  const host = match.competition.hostId === user.id;
  const player = homeUserId === user.id || awayUserId === user.id;
  if (!host && !player) return c.json({ error: 'FORBIDDEN' }, 403);
  if (match.status !== 'AWAITING_APPROVAL') return c.json({ error: 'MATCH_NOT_AWAITING_APPROVAL' }, 409);

  // Em Copa com prêmio, quem enviou o placar nunca pode homologar a própria prova.
  if (prizeBacked(match) && !host && match.submittedById === user.id) {
    return c.json({ error: 'SELF_APPROVAL_FORBIDDEN' }, 409);
  }

  const next = transitionMatch(match.status as MatchState, 'APPROVE');
  const fresh = await db.$transaction(async (tx) => {
    const changed = await tx.match.updateMany({
      where: { id: matchId, version: parsed.data.version, status: 'AWAITING_APPROVAL' },
      data: { status: next, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error('VERSION_CONFLICT');
    const row = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { competition: { select: { type: true } } } });
    await advance(tx, row);
    await applyFinishedMatchToProfiles(tx, matchId);
    return row;
  });

  const notifyUserId = match.submittedById && match.submittedById !== user.id ? match.submittedById : null;
  if (notifyUserId) {
    try {
      await sendPushToUsers(db, c.env, [notifyUserId], {
        title: '✅ Placar homologado',
        body: `${match.competition.name}: o resultado foi aprovado e entrou no ranking.`,
        url: `/competitions/${match.competitionId}`,
        tag: `score-approved-${matchId}`,
      });
    } catch (error) {
      console.warn('[push] score approval notification failed', error);
    }
  }
  return c.json(fresh);
});
