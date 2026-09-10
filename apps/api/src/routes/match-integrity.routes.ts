import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';
import { advanceKnockoutMatch } from '../services/knockout-progression.service';
import { applyFinishedMatchToProfiles } from '../services/profile-stats.service';
import { awardEpicComebackBadge } from '../services/achievement-engine.service';
import { sendPushToUsers } from '../services/push.service';
import { storeEvidence } from '../services/evidence.service';

export const matchIntegrity = new Hono<Env>();

type Tx = Prisma.TransactionClient;

type DisputeMeta = {
  disputeHomeScore: number | null;
  disputeAwayScore: number | null;
  disputeReason: string | null;
  disputedById: string | null;
  disputedAt: Date | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
};

const judgeSchema = z.object({
  decision: z.enum(['HOME', 'AWAY', 'CANCEL']),
  version: z.coerce.number().int().positive(),
  epicComeback: z.boolean().optional().default(false),
});

const accessInclude = {
  competition: {
    select: {
      hostId: true,
      name: true,
      type: true,
      entryFee: true,
      firstPrize: true,
      secondPrize: true,
      thirdPrize: true,
    },
  },
  homeTeam: { select: { id: true, name: true, participation: { select: { userId: true } } } },
  awayTeam: { select: { id: true, name: true, participation: { select: { userId: true } } } },
} satisfies Prisma.MatchInclude;

function isPrizeBacked(match: { competition: { entryFee: number; firstPrize: string | null; secondPrize: string | null; thirdPrize: string | null } }): boolean {
  return match.competition.entryFee > 0
    || Boolean(match.competition.firstPrize || match.competition.secondPrize || match.competition.thirdPrize);
}

async function lockMatch(tx: Tx, matchId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`integrity:${matchId}`}))`;
}

async function getDisputeMeta(db: Tx | Env['Variables']['prisma'], matchId: string): Promise<DisputeMeta> {
  const rows = await db.$queryRaw<DisputeMeta[]>`
    SELECT
      "disputeHomeScore",
      "disputeAwayScore",
      "disputeReason",
      "disputedById",
      "disputedAt",
      "resolvedById",
      "resolvedAt"
    FROM "Match"
    WHERE "id" = ${matchId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? {
    disputeHomeScore: null,
    disputeAwayScore: null,
    disputeReason: null,
    disputedById: null,
    disputedAt: null,
    resolvedById: null,
    resolvedAt: null,
  };
}


matchIntegrity.post('/:id/dispute', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const matchId = c.req.param('id');
  const match = await db.match.findUnique({ where: { id: matchId }, include: accessInclude });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  if (!isPrizeBacked(match)) return c.json({ error: 'DISPUTE_REQUIRES_PRIZE' }, 409);

  const homeUserId = match.homeTeam?.participation.userId;
  const awayUserId = match.awayTeam?.participation.userId;
  if (!homeUserId || !awayUserId || ![homeUserId, awayUserId].includes(user.id)) {
    return c.json({ error: 'PLAYER_ONLY' }, 403);
  }
  if (match.submittedById === user.id) return c.json({ error: 'CANNOT_DISPUTE_OWN_SCORE' }, 409);
  if (match.status !== 'AWAITING_APPROVAL') return c.json({ error: 'MATCH_NOT_AWAITING_APPROVAL' }, 409);

  const body = await c.req.parseBody();
  const version = Number(body.version);
  const homeScore = Number(body.homeScore);
  const awayScore = Number(body.awayScore);
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  const evidence = body.evidence;
  if (
    !Number.isInteger(version) || version < 1
    || !Number.isInteger(homeScore) || homeScore < 0 || homeScore > 99
    || !Number.isInteger(awayScore) || awayScore < 0 || awayScore > 99
    || !(evidence instanceof File)
  ) return c.json({ error: 'INVALID_INPUT' }, 400);

  const stored = await storeEvidence(c.env.EVIDENCE_BUCKET, evidence, match.competitionId, matchId, user.id);
  try {
    const changed = await db.$executeRaw`
      UPDATE "Match"
      SET
        "status" = 'DISPUTED'::"MatchStatus",
        "playerBEvidenceUrl" = ${stored.key},
        "disputeHomeScore" = ${homeScore},
        "disputeAwayScore" = ${awayScore},
        "disputeReason" = ${reason || null},
        "disputedById" = ${user.id}::uuid,
        "disputedAt" = CURRENT_TIMESTAMP,
        "version" = "version" + 1
      WHERE "id" = ${matchId}::uuid
        AND "version" = ${version}
        AND "status" = 'AWAITING_APPROVAL'::"MatchStatus"
    `;
    if (changed !== 1) {
      await c.env.EVIDENCE_BUCKET.delete(stored.key).catch(() => undefined);
      return c.json({ error: 'VERSION_CONFLICT' }, 409);
    }
  } catch (error) {
    await c.env.EVIDENCE_BUCKET.delete(stored.key).catch(() => undefined);
    throw error;
  }

  try {
    await sendPushToUsers(db, c.env, [match.competition.hostId], {
      title: '🚨 Protesto de partida',
      body: `${match.competition.name}: um jogador contestou o placar e enviou evidência.`,
      url: `/competitions/${match.competitionId}`,
      tag: `dispute-${matchId}`,
    });
  } catch (error) {
    console.warn('[push] dispute host notification failed', error);
  }

  return c.json({ disputed: true }, 201);
});

matchIntegrity.get('/:id/dispute', async (c) => {
  const db = c.get('prisma');
  const matchId = c.req.param('id');
  const userId = c.get('user').id;
  const match = await db.match.findUnique({ where: { id: matchId }, include: accessInclude });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  const homeUserId = match.homeTeam?.participation.userId;
  const awayUserId = match.awayTeam?.participation.userId;
  if (match.competition.hostId !== userId && homeUserId !== userId && awayUserId !== userId) {
    return c.json({ error: 'FORBIDDEN' }, 403);
  }
  const meta = await getDisputeMeta(db, matchId);
  return c.json({
    matchId,
    status: match.status,
    version: match.version,
    original: {
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      submittedById: match.submittedById,
      evidenceUrl: match.playerAEvidenceUrl ? `/api/matches/${matchId}/evidence/original` : null,
    },
    contest: {
      homeScore: meta.disputeHomeScore,
      awayScore: meta.disputeAwayScore,
      submittedById: meta.disputedById,
      reason: meta.disputeReason,
      disputedAt: meta.disputedAt,
      evidenceUrl: match.playerBEvidenceUrl ? `/api/matches/${matchId}/evidence/contest` : null,
    },
    home: { teamId: match.homeTeam?.id ?? null, name: match.homeTeam?.name ?? 'Mandante', userId: homeUserId ?? null },
    away: { teamId: match.awayTeam?.id ?? null, name: match.awayTeam?.name ?? 'Visitante', userId: awayUserId ?? null },
    isHost: match.competition.hostId === userId,
    resolvedAt: meta.resolvedAt,
  });
});

matchIntegrity.get('/:id/evidence/:slot', async (c) => {
  const db = c.get('prisma');
  const matchId = c.req.param('id');
  const slot = c.req.param('slot');
  if (!['original', 'contest'].includes(slot)) return c.json({ error: 'INVALID_EVIDENCE_SLOT' }, 400);
  const userId = c.get('user').id;
  const match = await db.match.findUnique({ where: { id: matchId }, include: accessInclude });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  const homeUserId = match.homeTeam?.participation.userId;
  const awayUserId = match.awayTeam?.participation.userId;
  if (match.competition.hostId !== userId && homeUserId !== userId && awayUserId !== userId) {
    return c.json({ error: 'FORBIDDEN' }, 403);
  }
  const key = slot === 'original' ? match.playerAEvidenceUrl : match.playerBEvidenceUrl;
  if (!key) return c.json({ error: 'EVIDENCE_NOT_FOUND' }, 404);
  const object = await c.env.EVIDENCE_BUCKET.get(key);
  if (!object) return c.json({ error: 'EVIDENCE_NOT_FOUND' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'image/jpeg');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
});

matchIntegrity.post('/:id/dispute/judge', async (c) => {
  const parsed = judgeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT' }, 400);
  const db = c.get('prisma');
  const host = c.get('user');
  const matchId = c.req.param('id');

  const outcome = await db.$transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const match = await tx.match.findUnique({ where: { id: matchId }, include: accessInclude });
    if (!match) return { error: 'MATCH_NOT_FOUND' as const };
    if (match.competition.hostId !== host.id) return { error: 'HOST_ONLY' as const };
    if (match.status !== 'DISPUTED') return { error: 'MATCH_NOT_DISPUTED' as const };
    if (match.version !== parsed.data.version) return { error: 'VERSION_CONFLICT' as const };
    if (!match.homeTeam || !match.awayTeam) return { error: 'MATCH_NOT_READY' as const };

    const meta = await getDisputeMeta(tx, matchId);
    const homeUserId = match.homeTeam.participation.userId;
    const awayUserId = match.awayTeam.participation.userId;

    if (parsed.data.decision === 'CANCEL') {
      const changed = await tx.$executeRaw`
        UPDATE "Match"
        SET
          "status" = 'CANCELED'::"MatchStatus",
          "resolvedById" = ${host.id}::uuid,
          "resolvedAt" = CURRENT_TIMESTAMP,
          "version" = "version" + 1
        WHERE "id" = ${matchId}::uuid
          AND "version" = ${parsed.data.version}
          AND "status" = 'DISPUTED'::"MatchStatus"
      `;
      if (changed !== 1) return { error: 'VERSION_CONFLICT' as const };
      return { canceled: true as const, userIds: [homeUserId, awayUserId], competitionId: match.competitionId, competitionName: match.competition.name };
    }

    const winnerUserId = parsed.data.decision === 'HOME' ? homeUserId : awayUserId;
    const originalBelongsToWinner = match.submittedById === winnerUserId;
    const contestBelongsToWinner = meta.disputedById === winnerUserId;
    let homeScore = originalBelongsToWinner ? match.homeScore : contestBelongsToWinner ? meta.disputeHomeScore : null;
    let awayScore = originalBelongsToWinner ? match.awayScore : contestBelongsToWinner ? meta.disputeAwayScore : null;

    const chosenSideWinning = homeScore != null && awayScore != null
      && (parsed.data.decision === 'HOME' ? homeScore > awayScore : awayScore > homeScore);
    if (!chosenSideWinning) {
      homeScore = parsed.data.decision === 'HOME' ? 1 : 0;
      awayScore = parsed.data.decision === 'AWAY' ? 1 : 0;
    }

    const changed = await tx.$executeRaw`
      UPDATE "Match"
      SET
        "status" = 'FINISHED'::"MatchStatus",
        "homeScore" = ${homeScore},
        "awayScore" = ${awayScore},
        "homePenaltyScore" = NULL,
        "awayPenaltyScore" = NULL,
        "resolvedById" = ${host.id}::uuid,
        "resolvedAt" = CURRENT_TIMESTAMP,
        "version" = "version" + 1
      WHERE "id" = ${matchId}::uuid
        AND "version" = ${parsed.data.version}
        AND "status" = 'DISPUTED'::"MatchStatus"
    `;
    if (changed !== 1) return { error: 'VERSION_CONFLICT' as const };

    const fresh = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { competition: { select: { type: true } } } });
    await advanceKnockoutMatch(tx, fresh);
    await applyFinishedMatchToProfiles(tx, matchId);
    return {
      canceled: false as const,
      winnerUserId,
      userIds: [homeUserId, awayUserId],
      competitionId: match.competitionId,
      competitionName: match.competition.name,
      epicComeback: parsed.data.epicComeback,
    };
  });

  if ('error' in outcome) {
    const status = outcome.error === 'MATCH_NOT_FOUND' ? 404 : outcome.error === 'HOST_ONLY' ? 403 : 409;
    return c.json({ error: outcome.error }, status);
  }

  if (!outcome.canceled && outcome.epicComeback) {
    await awardEpicComebackBadge(db, outcome.winnerUserId);
  }
  try {
    await sendPushToUsers(db, c.env, outcome.userIds, {
      title: outcome.canceled ? '⚖️ Partida cancelada pelo Host' : '⚖️ Protesto julgado',
      body: `${outcome.competitionName}: o Host encerrou a análise do protesto.`,
      url: `/competitions/${outcome.competitionId}`,
      tag: `dispute-resolved-${matchId}`,
    });
  } catch (error) {
    console.warn('[push] dispute resolution notification failed', error);
  }
  return c.json({ ok: true, canceled: outcome.canceled });
});
