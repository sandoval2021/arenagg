import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import type { Env } from '../types/env';
import { scoreFields } from '../schemas/match.schema';
import { resolveWinner } from '../domain/bracket/knockout';
import {
  transitionMatch,
  InvalidMatchTransitionError,
  type MatchState,
} from '@chavea/domain/match/states';
import { storeEvidence } from '../services/evidence.service';
import { applyFinishedMatchToProfiles } from '../services/profile-stats.service';
import { replaceMatchScorers } from '../services/match-scorers.service';
import { detectClipPlatform } from './match-media.routes';

export const matchScore = new Hono<Env>();

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

// This router is mounted before the legacy matches router. It owns the exact
// POST /:id/score route so score + scorers + optional highlight are one atomic DB change.
matchScore.post('/:id/score', async (c) => {
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
  if (!parsed.success) {
    const scorerIssue = parsed.error.issues.find((issue) => issue.path[0] === 'scorers');
    const clipIssue = parsed.error.issues.find((issue) => issue.path[0] === 'clipUrl');
    return c.json(
      {
        error: scorerIssue ? 'SCORER_TOTAL_EXCEEDS_SCORE' : clipIssue ? 'INVALID_CLIP_URL' : 'INVALID_INPUT',
        message: scorerIssue?.message ?? clipIssue?.message,
        issues: parsed.error.flatten(),
      },
      400,
    );
  }

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

      const row = await tx.match.findUniqueOrThrow({
        where: { id },
        include: { competition: true },
      });

      await replaceMatchScorers(tx, row, parsed.data.scorers);

      if (parsed.data.clipUrl) {
        await tx.matchMedia.upsert({
          where: { matchId_url: { matchId: id, url: parsed.data.clipUrl } },
          create: {
            matchId: id,
            createdById: user.id,
            url: parsed.data.clipUrl,
            platform: detectClipPlatform(parsed.data.clipUrl),
          },
          update: {},
        });
      }

      if (next === 'FINISHED') {
        await advance(tx, row);
        await applyFinishedMatchToProfiles(tx, id);
      }
      return row;
    });

    return c.json(fresh);
  } catch (error) {
    if (error instanceof InvalidMatchTransitionError) {
      return c.json({ error: 'INVALID_MATCH_TRANSITION', message: error.message }, 400);
    }
    if (error instanceof Error && error.message === 'MATCH_TEAMS_NOT_READY') {
      return c.json({ error: 'MATCH_TEAMS_NOT_READY' }, 409);
    }
    throw error;
  }
});
