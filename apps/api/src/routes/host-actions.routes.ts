import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';
import { generateKnockout } from '../domain/bracket/knockout';
import { generateRoundRobin } from '../domain/matchmaking/roundRobin';
import { calculateStandings } from '../domain/standings/calculate';

export const hostActions = new Hono<Env>();
type Tx = Prisma.TransactionClient;

const playoffSchema = z.object({ size: z.union([z.literal(4), z.literal(8)]) });
const TERMINAL_MATCH_STATUSES = ['FINISHED', 'CANCELED'] as const;

async function lockCompetition(tx: Tx, competitionId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`host-actions:${competitionId}`}))`;
}

function seededBracket(teamIds: readonly string[]): string[] {
  if (teamIds.length === 4) return [teamIds[0], teamIds[3], teamIds[1], teamIds[2]];
  if (teamIds.length === 8) {
    return [teamIds[0], teamIds[7], teamIds[3], teamIds[4], teamIds[1], teamIds[6], teamIds[2], teamIds[5]];
  }
  throw new Error('PLAYOFF_SIZE_UNSUPPORTED');
}

function knockoutRoundName(teamCount: number, roundNumber: number): string {
  const rounds = Math.log2(teamCount);
  const remaining = rounds - roundNumber;
  if (remaining === 0) return 'Final';
  if (remaining === 1) return 'Semifinal';
  if (remaining === 2) return 'Quartas de final';
  return `Mata-mata · Rodada ${roundNumber}`;
}

async function createKnockoutStage(
  tx: Tx,
  competitionId: string,
  teamIds: readonly string[],
  order: number,
): Promise<{ stageId: string; matchCount: number }> {
  const stage = await tx.stage.create({
    data: {
      competitionId,
      type: 'KNOCKOUT',
      name: 'Fase Final · Mata-Mata',
      order,
      status: 'ACTIVE',
    },
  });

  const slots = generateKnockout(teamIds);
  const bracketSize = teamIds.length;
  let cursor = 0;
  let slotsInRound = bracketSize / 2;
  let roundNumber = 1;
  const matchByPosition = new Map<number, string>();

  while (slotsInRound >= 1) {
    const round = await tx.round.create({
      data: {
        stageId: stage.id,
        number: roundNumber,
        name: knockoutRoundName(bracketSize, roundNumber),
        status: roundNumber === 1 ? 'ACTIVE' : 'PENDING',
      },
    });

    for (const slot of slots.slice(cursor, cursor + slotsInRound)) {
      const match = await tx.match.create({
        data: {
          competitionId,
          stageId: stage.id,
          roundId: round.id,
          bracketPosition: slot.position,
          homeTeamId: slot.homeTeamId,
          awayTeamId: slot.awayTeamId,
          nextMatchSlot: slot.nextSlot,
          leg: 1,
        },
      });
      matchByPosition.set(slot.position, match.id);
    }

    cursor += slotsInRound;
    slotsInRound /= 2;
    roundNumber += 1;
  }

  for (const slot of slots) {
    if (!slot.nextPosition) continue;
    const matchId = matchByPosition.get(slot.position);
    const nextMatchId = matchByPosition.get(slot.nextPosition);
    if (matchId && nextMatchId) {
      await tx.match.update({ where: { id: matchId }, data: { nextMatchId } });
    }
  }

  return { stageId: stage.id, matchCount: slots.length };
}

async function advanceRoundIfTerminal(tx: Tx, stageId: string, roundId: string | null): Promise<void> {
  if (!roundId) return;
  const openMatches = await tx.match.count({
    where: { roundId, status: { notIn: [...TERMINAL_MATCH_STATUSES] } },
  });
  if (openMatches > 0) return;

  const round = await tx.round.findUnique({ where: { id: roundId }, select: { number: true } });
  if (!round) return;
  await tx.round.update({ where: { id: roundId }, data: { status: 'FINISHED' } });

  const nextRound = await tx.round.findFirst({
    where: { stageId, number: { gt: round.number }, status: 'PENDING' },
    orderBy: { number: 'asc' },
    select: { id: true },
  });
  if (nextRound) await tx.round.update({ where: { id: nextRound.id }, data: { status: 'ACTIVE' } });
}

async function hostCompetition(tx: Tx, competitionId: string, userId: string) {
  const competition = await tx.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      hostId: true,
      status: true,
      stages: { orderBy: { order: 'asc' }, select: { id: true, type: true, status: true, order: true, name: true } },
    },
  });
  if (!competition) return { error: 'COMPETITION_NOT_FOUND' as const };
  if (competition.hostId !== userId) return { error: 'HOST_ONLY' as const };
  if (competition.status !== 'IN_PROGRESS') return { error: 'COMPETITION_NOT_IN_PROGRESS' as const };
  return { competition };
}

hostActions.get('/:id/host-actions', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');

  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      hostId: true,
      status: true,
      stages: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          type: true,
          status: true,
          order: true,
          name: true,
          rounds: { select: { id: true, number: true, name: true, status: true } },
        },
      },
      teams: { where: { participation: { status: 'ACTIVE' } }, select: { id: true } },
    },
  });
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);
  if (competition.hostId !== user.id) return c.json({ error: 'HOST_ONLY' }, 403);

  const cancelableMatches = await db.match.findMany({
    where: {
      competitionId,
      status: { in: ['PENDING', 'AWAITING_APPROVAL', 'DISPUTED'] },
      stage: { type: { in: ['LEAGUE', 'GROUP'] } },
      profileAppliedAt: null,
    },
    take: 40,
    orderBy: [{ round: { number: 'asc' } }, { id: 'asc' }],
    select: {
      id: true,
      status: true,
      version: true,
      stage: { select: { id: true, type: true, name: true } },
      round: { select: { id: true, number: true, name: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      homeTeamName: true,
      awayTeamName: true,
    },
  });

  const leagueStage = competition.stages.find((stage) => stage.type === 'LEAGUE' && stage.status === 'ACTIVE');
  const knockoutStage = [...competition.stages].reverse().find((stage) => stage.type === 'KNOCKOUT');
  const teamCount = competition.teams.length;

  return c.json({
    competitionId,
    competitionStatus: competition.status,
    leagueStage: leagueStage ?? null,
    knockoutStage: knockoutStage ?? null,
    teamCount,
    allowedPlayoffSizes: leagueStage && !knockoutStage
      ? ([4, 8] as const).filter((size) => teamCount >= size)
      : [],
    extraTurnCount: leagueStage
      ? leagueStage.rounds.filter((round) => round.name?.startsWith('Turno extra ')).length
      : 0,
    cancelableMatches: cancelableMatches.map((match) => ({
      ...match,
      homeName: match.homeTeam?.name ?? match.homeTeamName ?? 'Mandante',
      awayName: match.awayTeam?.name ?? match.awayTeamName ?? 'Visitante',
    })),
  });
});

hostActions.post('/:id/host-actions/matches/:matchId/cancel', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');
  const matchId = c.req.param('matchId');

  const result = await db.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const access = await hostCompetition(tx, competitionId, user.id);
    if ('error' in access) return access;

    const match = await tx.match.findFirst({
      where: { id: matchId, competitionId },
      select: { id: true, stageId: true, roundId: true, status: true, profileAppliedAt: true, stage: { select: { type: true } } },
    });
    if (!match) return { error: 'MATCH_NOT_FOUND' as const };
    if (match.stage.type === 'KNOCKOUT') return { error: 'KNOCKOUT_MATCH_CANCEL_FORBIDDEN' as const };
    if (match.status === 'FINISHED' || match.profileAppliedAt) return { error: 'MATCH_ALREADY_FINALIZED' as const };
    if (match.status === 'CANCELED') return { canceled: true as const, alreadyCanceled: true as const, matchId };

    const changed = await tx.match.updateMany({
      where: {
        id: matchId,
        competitionId,
        profileAppliedAt: null,
        status: { in: ['PENDING', 'AWAITING_APPROVAL', 'DISPUTED'] },
      },
      data: {
        status: 'CANCELED',
        resolvedById: user.id,
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) return { error: 'MATCH_CANCEL_CONFLICT' as const };

    await advanceRoundIfTerminal(tx, match.stageId, match.roundId);
    return { canceled: true as const, alreadyCanceled: false as const, matchId };
  }, { maxWait: 10_000, timeout: 20_000 });

  if ('error' in result) {
    const status = result.error === 'COMPETITION_NOT_FOUND' || result.error === 'MATCH_NOT_FOUND'
      ? 404
      : result.error === 'HOST_ONLY'
        ? 403
        : 409;
    return c.json({ error: result.error }, status);
  }
  return c.json(result);
});

hostActions.post('/:id/host-actions/playoffs', async (c) => {
  const parsed = playoffSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_PLAYOFF_SIZE', message: 'Escolha Top 4 ou Top 8.' }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');
  const playoffSize = parsed.data.size;

  const result = await db.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const access = await hostCompetition(tx, competitionId, user.id);
    if ('error' in access) return access;
    const { competition } = access;

    if (competition.stages.some((stage) => stage.type === 'KNOCKOUT')) {
      return { error: 'PLAYOFFS_ALREADY_EXIST' as const };
    }
    const leagueStage = competition.stages.find((stage) => stage.type === 'LEAGUE' && stage.status === 'ACTIVE');
    if (!leagueStage) return { error: 'ACTIVE_LEAGUE_STAGE_NOT_FOUND' as const };

    const unresolved = await tx.match.count({
      where: { stageId: leagueStage.id, status: { in: ['AWAITING_APPROVAL', 'DISPUTED'] } },
    });
    if (unresolved > 0) return { error: 'UNRESOLVED_RESULTS_EXIST' as const, unresolved };

    const teams = await tx.team.findMany({
      where: { competitionId, participation: { status: 'ACTIVE' } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (teams.length < playoffSize) {
      return { error: 'NOT_ENOUGH_TEAMS_FOR_PLAYOFFS' as const, required: playoffSize, available: teams.length };
    }

    const finished = await tx.match.findMany({
      where: {
        competitionId,
        stageId: leagueStage.id,
        status: 'FINISHED',
        homeTeamId: { not: null },
        awayTeamId: { not: null },
        homeScore: { not: null },
        awayScore: { not: null },
      },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    });
    if (finished.length === 0) return { error: 'NO_FINISHED_LEAGUE_MATCHES' as const };

    const standings = calculateStandings(
      teams.map((team) => team.id),
      finished.map((match) => ({
        homeTeamId: match.homeTeamId!,
        awayTeamId: match.awayTeamId!,
        homeScore: match.homeScore!,
        awayScore: match.awayScore!,
      })),
    );
    const qualified = standings.slice(0, playoffSize).map((row) => row.teamId);
    if (qualified.length !== playoffSize) return { error: 'PLAYOFF_QUALIFIERS_NOT_READY' as const };

    const now = new Date();
    const canceled = await tx.match.updateMany({
      where: { stageId: leagueStage.id, status: 'PENDING', profileAppliedAt: null },
      data: { status: 'CANCELED', resolvedById: user.id, resolvedAt: now, version: { increment: 1 } },
    });
    await tx.round.updateMany({ where: { stageId: leagueStage.id }, data: { status: 'FINISHED' } });
    await tx.stage.update({ where: { id: leagueStage.id }, data: { status: 'FINISHED' } });

    const nextOrder = Math.max(...competition.stages.map((stage) => stage.order), 0) + 1;
    const seeded = seededBracket(qualified);
    const bracket = await createKnockoutStage(tx, competitionId, seeded, nextOrder);

    return {
      generated: true as const,
      playoffSize,
      canceledPendingMatches: canceled.count,
      qualifiedTeamIds: qualified,
      stageId: bracket.stageId,
      bracketMatchCount: bracket.matchCount,
    };
  }, { maxWait: 15_000, timeout: 30_000 });

  if ('error' in result) {
    const status = result.error === 'COMPETITION_NOT_FOUND'
      ? 404
      : result.error === 'HOST_ONLY'
        ? 403
        : result.error === 'INVALID_PLAYOFF_SIZE'
          ? 400
          : 409;
    return c.json(result, status);
  }
  return c.json(result, 201);
});

hostActions.post('/:id/host-actions/extra-turn', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');

  const result = await db.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const access = await hostCompetition(tx, competitionId, user.id);
    if ('error' in access) return access;
    const { competition } = access;

    if (competition.stages.some((stage) => stage.type === 'KNOCKOUT')) {
      return { error: 'PLAYOFFS_ALREADY_STARTED' as const };
    }
    const leagueStage = competition.stages.find((stage) => stage.type === 'LEAGUE' && stage.status === 'ACTIVE');
    if (!leagueStage) return { error: 'ACTIVE_LEAGUE_STAGE_NOT_FOUND' as const };

    const teams = await tx.team.findMany({
      where: { competitionId, participation: { status: 'ACTIVE' } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (teams.length < 2) return { error: 'NOT_ENOUGH_TEAMS' as const };

    const rounds = await tx.round.findMany({
      where: { stageId: leagueStage.id },
      select: { number: true, name: true, status: true },
      orderBy: { number: 'asc' },
    });
    const maxRound = rounds.at(-1)?.number ?? 0;
    const priorExtraTurns = new Set(
      rounds
        .map((round) => round.name?.match(/^Turno extra (\d+)/)?.[1])
        .filter((value): value is string => Boolean(value)),
    ).size;
    const extraTurnNumber = priorExtraTurns + 1;
    const schedule = generateRoundRobin(teams.map((team) => team.id), false);
    const hasActiveRound = rounds.some((round) => round.status === 'ACTIVE');
    let matchCount = 0;

    for (const generated of schedule) {
      const roundNumber = maxRound + generated.number;
      const round = await tx.round.create({
        data: {
          stageId: leagueStage.id,
          number: roundNumber,
          name: `Turno extra ${extraTurnNumber} · Rodada ${generated.number}`,
          status: !hasActiveRound && generated.number === 1 ? 'ACTIVE' : 'PENDING',
        },
      });
      if (generated.matches.length > 0) {
        await tx.match.createMany({
          data: generated.matches.map((match) => ({
            competitionId,
            stageId: leagueStage.id,
            roundId: round.id,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            leg: 1,
          })),
        });
        matchCount += generated.matches.length;
      }
    }

    return {
      generated: true as const,
      extraTurnNumber,
      roundsAdded: schedule.length,
      matchesAdded: matchCount,
      firstNewRound: maxRound + 1,
      lastNewRound: maxRound + schedule.length,
    };
  }, { maxWait: 15_000, timeout: 30_000 });

  if ('error' in result) {
    const status = result.error === 'COMPETITION_NOT_FOUND' ? 404 : result.error === 'HOST_ONLY' ? 403 : 409;
    return c.json(result, status);
  }
  return c.json(result, 201);
});

hostActions.get('/:id/playoffs', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');
  const access = await db.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    select: { id: true, name: true },
  });
  if (!access) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const stage = await db.stage.findFirst({
    where: { competitionId, type: 'KNOCKOUT' },
    orderBy: { order: 'desc' },
    select: {
      id: true,
      name: true,
      order: true,
      status: true,
      rounds: {
        orderBy: { number: 'asc' },
        select: {
          id: true,
          number: true,
          name: true,
          status: true,
          matches: {
            orderBy: [{ bracketPosition: 'asc' }, { leg: 'asc' }],
            select: {
              id: true,
              status: true,
              version: true,
              bracketPosition: true,
              homeScore: true,
              awayScore: true,
              homePenaltyScore: true,
              awayPenaltyScore: true,
              homeTeam: {
                select: {
                  id: true,
                  name: true,
                  logoUrl: true,
                  participation: { select: { teamLogoUrl: true, user: { select: { avatarUrl: true } } } },
                },
              },
              awayTeam: {
                select: {
                  id: true,
                  name: true,
                  logoUrl: true,
                  participation: { select: { teamLogoUrl: true, user: { select: { avatarUrl: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!stage) return c.json({ exists: false, competitionId, competitionName: access.name, stage: null });
  return c.json({
    exists: true,
    competitionId,
    competitionName: access.name,
    stage: {
      ...stage,
      rounds: stage.rounds.map((round) => ({
        ...round,
        matches: round.matches.map((match) => ({
          ...match,
          homeTeam: match.homeTeam
            ? {
                id: match.homeTeam.id,
                name: match.homeTeam.name,
                logoUrl: match.homeTeam.logoUrl ?? match.homeTeam.participation.teamLogoUrl ?? match.homeTeam.participation.user.avatarUrl ?? null,
              }
            : null,
          awayTeam: match.awayTeam
            ? {
                id: match.awayTeam.id,
                name: match.awayTeam.name,
                logoUrl: match.awayTeam.logoUrl ?? match.awayTeam.participation.teamLogoUrl ?? match.awayTeam.participation.user.avatarUrl ?? null,
              }
            : null,
        })),
      })),
    },
  });
});
