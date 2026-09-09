import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import type { Env } from '../types/env';
import { scoreFields, approveSchema, resolveSchema } from '../schemas/match.schema';
import { resolveWinner } from '../domain/bracket/knockout';
import {
  transitionMatch,
  InvalidMatchTransitionError,
  type MatchState,
} from '@chavea/domain/match/states';
import { storeEvidence } from '../services/evidence.service';

export const matches = new Hono<Env>();

type MatchAccess = {
  competition: { hostId: string; type: string; requireValidation: boolean };
  homeTeam: { participation: { userId: string } } | null;
  awayTeam: { participation: { userId: string } } | null;
};

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

function hasMatchAccess(match: MatchAccess, userId: string): boolean {
  return (
    match.competition.hostId === userId ||
    match.homeTeam?.participation.userId === userId ||
    match.awayTeam?.participation.userId === userId
  );
}

function handleTransitionError(c: Parameters<Parameters<typeof matches.onError>[0]>[1], error: unknown) {
  if (error instanceof InvalidMatchTransitionError) {
    return c.json({ error: 'INVALID_MATCH_TRANSITION', message: error.message }, 400);
  }
  throw error;
}

async function advance(tx: Prisma.TransactionClient, match: AdvanceableMatch) {
  if (match.competition.type === 'LEAGUE' || !match.nextMatchId) return;
  if (
    !match.homeTeamId ||
    !match.awayTeamId ||
    match.homeScore == null ||
    match.awayScore == null ||
    !match.nextMatchSlot
  ) return;

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

const accessInclude = {
  competition: true,
  homeTeam: { select: { participation: { select: { userId: true } } } },
  awayTeam: { select: { participation: { select: { userId: true } } } },
} satisfies Prisma.MatchInclude;

matches.post('/:id/score', async (c) => {
  const id = c.req.param('id');
  const db = c.get('prisma');
  const user = c.get('user');
  const match = await db.match.findUnique({ where: { id }, include: accessInclude });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  if (!hasMatchAccess(match, user.id)) return c.json({ error: 'FORBIDDEN' }, 403);

  const contentType = c.req.header('content-type') ?? '';
  let raw: unknown;
  let evidence: File | undefined;

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    raw = body;
    evidence = body.evidence instanceof File ? body.evidence : undefined;
  } else {
    raw = await c.req.json().catch(() => null);
  }

  const parsed = scoreFields.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);
  if (match.competition.requireValidation && !evidence) {
    return c.json({ error: 'EVIDENCE_REQUIRED' }, 400);
  }

  try {
    const next = transitionMatch(
      match.status as MatchState,
      match.competition.requireValidation ? 'SUBMIT_WITH_VALIDATION' : 'SUBMIT_WITHOUT_VALIDATION',
    );

    let evidenceKey: string | undefined;
    if (evidence) {
      evidenceKey = (await storeEvidence(c.env.EVIDENCE_BUCKET, evidence, match.competitionId, id, user.id)).key;
    }

    const fresh = await db.$transaction(async (tx) => {
      const changed = await tx.match.updateMany({
        where: { id, version: parsed.data.version, status: match.status },
        data: {
          homeScore: parsed.data.homeScore,
          awayScore: parsed.data.awayScore,
          homePenaltyScore: parsed.data.homePenaltyScore,
          awayPenaltyScore: parsed.data.awayPenaltyScore,
          playerAEvidenceUrl: evidenceKey,
          status: next,
          submittedById: user.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('VERSION_CONFLICT');

      const row = await tx.match.findUniqueOrThrow({ where: { id }, include: { competition: true } });
      if (next === 'FINISHED') await advance(tx, row);
      return row;
    });

    return c.json(fresh);
  } catch (error) {
    return handleTransitionError(c, error);
  }
});

matches.post('/:id/approve', async (c) => {
  const parsed = approveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT' }, 400);

  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');
  const match = await db.match.findUnique({ where: { id }, include: accessInclude });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  if (!hasMatchAccess(match, user.id)) return c.json({ error: 'FORBIDDEN' }, 403);

  try {
    const next = transitionMatch(match.status as MatchState, 'APPROVE');
    const row = await db.$transaction(async (tx) => {
      const changed = await tx.match.updateMany({
        where: { id, version: parsed.data.version, status: match.status },
        data: { status: next, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error('VERSION_CONFLICT');

      const fresh = await tx.match.findUniqueOrThrow({ where: { id }, include: { competition: true } });
      await advance(tx, fresh);
      return fresh;
    });
    return c.json(row);
  } catch (error) {
    return handleTransitionError(c, error);
  }
});

matches.post('/:id/dispute', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');
  const match = await db.match.findUnique({ where: { id }, include: accessInclude });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  if (!hasMatchAccess(match, user.id)) return c.json({ error: 'FORBIDDEN' }, 403);

  const body = await c.req.parseBody();
  const version = Number(body.version);
  const file = body.evidence;
  if (!Number.isInteger(version) || version < 1 || !(file instanceof File)) {
    return c.json({ error: 'INVALID_INPUT' }, 400);
  }

  try {
    const next = transitionMatch(match.status as MatchState, 'REJECT');
    const key = (await storeEvidence(c.env.EVIDENCE_BUCKET, file, match.competitionId, id, user.id)).key;
    const changed = await db.match.updateMany({
      where: { id, version, status: match.status },
      data: { playerBEvidenceUrl: key, status: next, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error('VERSION_CONFLICT');
    return c.json(await db.match.findUniqueOrThrow({ where: { id } }));
  } catch (error) {
    return handleTransitionError(c, error);
  }
});

matches.post('/:id/resolve', async (c) => {
  const parsed = resolveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);

  const db = c.get('prisma');
  const id = c.req.param('id');
  const match = await db.match.findUnique({ where: { id }, include: { competition: true } });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  if (match.competition.hostId !== c.get('user').id) return c.json({ error: 'FORBIDDEN' }, 403);

  try {
    const event = parsed.data.action === 'CANCEL' ? 'HOST_CANCEL' : 'HOST_RESOLVE';
    const next = transitionMatch(match.status as MatchState, event);
    const row = await db.$transaction(async (tx) => {
      const data = parsed.data.action === 'RESOLVE'
        ? {
            status: next,
            homeScore: parsed.data.homeScore,
            awayScore: parsed.data.awayScore,
            homePenaltyScore: parsed.data.homePenaltyScore,
            awayPenaltyScore: parsed.data.awayPenaltyScore,
            version: { increment: 1 },
          }
        : { status: next, version: { increment: 1 } };

      const changed = await tx.match.updateMany({
        where: { id, version: parsed.data.version, status: match.status },
        data,
      });
      if (changed.count !== 1) throw new Error('VERSION_CONFLICT');

      const fresh = await tx.match.findUniqueOrThrow({ where: { id }, include: { competition: true } });
      if (next === 'FINISHED') await advance(tx, fresh);
      return fresh;
    });
    return c.json(row);
  } catch (error) {
    return handleTransitionError(c, error);
  }
});
