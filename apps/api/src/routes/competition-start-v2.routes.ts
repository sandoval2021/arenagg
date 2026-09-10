import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import type { Env } from '../types/env';
import { generateKnockout } from '../domain/bracket/knockout';
import { generateRoundRobin } from '../domain/matchmaking/roundRobin';
import { initializeGroupStandings } from '../services/group-stage.service';

export const competitionStartV2 = new Hono<Env>();
type Tx = Prisma.TransactionClient;

type StartError =
  | 'COMPETITION_NOT_FOUND'
  | 'HOST_ONLY'
  | 'COMPETITION_ALREADY_STARTED'
  | 'MATCHES_ALREADY_EXIST'
  | 'NOT_ENOUGH_PARTICIPANTS'
  | 'NOT_ENOUGH_PARTICIPANTS_FOR_GROUPS'
  | 'START_CONFLICT'
  | 'KNOCKOUT_GENERATION_FAILED';

type StartFailure = {
  error: StartError;
  message: string;
  status: 400 | 403 | 404 | 409 | 500;
};

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [result[index], result[random]] = [result[random], result[index]];
  }
  return result;
}

function failure(error: StartError): StartFailure {
  switch (error) {
    case 'COMPETITION_NOT_FOUND':
      return { error, status: 404, message: 'Campeonato não encontrado.' };
    case 'HOST_ONLY':
      return { error, status: 403, message: 'Somente o Host pode gerar as partidas.' };
    case 'COMPETITION_ALREADY_STARTED':
      return { error, status: 409, message: 'Este campeonato já foi iniciado.' };
    case 'MATCHES_ALREADY_EXIST':
      return { error, status: 409, message: 'As partidas desta Copa já foram geradas.' };
    case 'NOT_ENOUGH_PARTICIPANTS':
      return { error, status: 400, message: 'São necessários pelo menos 2 jogadores ativos para iniciar.' };
    case 'NOT_ENOUGH_PARTICIPANTS_FOR_GROUPS':
      return { error, status: 400, message: 'Número de participantes insuficiente para a quantidade de grupos.' };
    case 'START_CONFLICT':
      return { error, status: 409, message: 'Outra tentativa de início venceu a corrida. Atualize a Copa.' };
    case 'KNOCKOUT_GENERATION_FAILED':
      return { error, status: 500, message: 'Não foi possível montar a chave do mata-mata.' };
  }
}

function safePrismaMeta(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  return {
    code: error.code,
    target: typeof error.meta?.target === 'string' || Array.isArray(error.meta?.target) ? error.meta.target : undefined,
    constraint: typeof error.meta?.constraint === 'string' ? error.meta.constraint : undefined,
    modelName: typeof error.meta?.modelName === 'string' ? error.meta.modelName : undefined,
  };
}

async function lockCompetition(tx: Tx, competitionId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`competition-start-v2:${competitionId}`}))`;
}

async function ensureParticipantTeam(
  tx: Tx,
  competitionId: string,
  participation: {
    id: string;
    userId: string;
    teamName: string;
    teamLogoUrl: string | null;
    team: { id: string } | null;
    user: { name: string; displayName: string | null };
  },
): Promise<{ teamId: string; created: boolean }> {
  if (participation.team) return { teamId: participation.team.id, created: false };

  const preferred = (
    participation.teamName?.trim()
    || participation.user.displayName?.trim()
    || participation.user.name.trim()
    || 'Jogador'
  ).slice(0, 60);

  const collision = await tx.team.findFirst({
    where: { competitionId, name: preferred },
    select: { id: true },
  });
  const suffix = participation.userId.replaceAll('-', '').slice(0, 6);
  const name = collision ? `${preferred.slice(0, 52)}-${suffix}` : preferred;

  const team = await tx.team.create({
    data: {
      competitionId,
      participationId: participation.id,
      createdById: participation.userId,
      name,
      logoUrl: participation.teamLogoUrl,
    },
    select: { id: true },
  });

  await tx.participation.update({
    where: { id: participation.id },
    data: { teamName: name },
  });

  return { teamId: team.id, created: true };
}

async function buildLeague(tx: Tx, competitionId: string, teamIds: string[], homeAway: boolean): Promise<number> {
  const stage = await tx.stage.create({
    data: { competitionId, type: 'LEAGUE', name: 'Liga', order: 1, status: 'ACTIVE' },
  });
  const schedule = generateRoundRobin(teamIds, homeAway);
  let matchCount = 0;

  for (const roundSchedule of schedule) {
    const round = await tx.round.create({
      data: {
        stageId: stage.id,
        number: roundSchedule.number,
        name: `Liga · Rodada ${roundSchedule.number}`,
        status: roundSchedule.number === 1 ? 'ACTIVE' : 'PENDING',
      },
    });
    if (roundSchedule.matches.length === 0) continue;
    await tx.match.createMany({
      data: roundSchedule.matches.map((match) => ({
        competitionId,
        stageId: stage.id,
        roundId: round.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
      })),
    });
    matchCount += roundSchedule.matches.length;
  }

  return matchCount;
}

async function buildKnockout(tx: Tx, competitionId: string, teamIds: string[], homeAway: boolean): Promise<number> {
  const stage = await tx.stage.create({
    data: { competitionId, type: 'KNOCKOUT', name: 'Mata-mata', order: 1, status: 'ACTIVE' },
  });

  const slots = generateKnockout(teamIds);
  const bracketSize = 2 ** Math.ceil(Math.log2(teamIds.length));
  const expectedSlots = bracketSize - 1;
  if (slots.length !== expectedSlots) throw new Error('KNOCKOUT_GENERATION_FAILED');

  // 4 jogadores => bracketSize 4 => 2 semifinais + 1 final, sem BYE.
  if (teamIds.length === 4) {
    const firstRound = slots.slice(0, 2);
    if (firstRound.length !== 2 || firstRound.some((slot) => !slot.homeTeamId || !slot.awayTeamId)) {
      throw new Error('KNOCKOUT_GENERATION_FAILED');
    }
  }

  let cursor = 0;
  let slotsInRound = bracketSize / 2;
  let roundNumber = 1;
  const firstLegByPosition = new Map<number, string>();
  let matchCount = 0;

  while (slotsInRound >= 1) {
    const round = await tx.round.create({
      data: {
        stageId: stage.id,
        number: roundNumber,
        name: slotsInRound === 1 ? 'Final' : roundNumber === 1 && bracketSize === 4 ? 'Semifinal' : `Mata-mata · Rodada ${roundNumber}`,
        status: roundNumber === 1 ? 'ACTIVE' : 'PENDING',
      },
    });

    for (const slot of slots.slice(cursor, cursor + slotsInRound)) {
      const firstLeg = await tx.match.create({
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
        select: { id: true },
      });
      firstLegByPosition.set(slot.position, firstLeg.id);
      matchCount += 1;

      if (homeAway && slot.homeTeamId && slot.awayTeamId) {
        await tx.match.create({
          data: {
            competitionId,
            stageId: stage.id,
            roundId: round.id,
            bracketPosition: slot.position,
            homeTeamId: slot.awayTeamId,
            awayTeamId: slot.homeTeamId,
            nextMatchSlot: slot.nextSlot,
            leg: 2,
          },
        });
        matchCount += 1;
      }
    }

    cursor += slotsInRound;
    slotsInRound /= 2;
    roundNumber += 1;
  }

  if (!homeAway) {
    for (const slot of slots) {
      if (!slot.nextPosition) continue;
      const currentId = firstLegByPosition.get(slot.position);
      const nextId = firstLegByPosition.get(slot.nextPosition);
      if (currentId && nextId) await tx.match.update({ where: { id: currentId }, data: { nextMatchId: nextId } });
    }
  }

  return matchCount;
}

function effectiveGroupCount(configured: number | null, participantCount: number): number | null {
  if (participantCount < 4) return null;
  const requested = configured && [2, 4, 8].includes(configured) ? configured : 4;
  const maxGroups = Math.floor(participantCount / 2);
  return [8, 4, 2].find((count) => count <= requested && count <= maxGroups) ?? null;
}

async function buildGroups(
  tx: Tx,
  competitionId: string,
  teamIds: string[],
  groupCount: number,
  homeAway: boolean,
): Promise<number> {
  const buckets = Array.from({ length: groupCount }, () => [] as string[]);
  teamIds.forEach((teamId, index) => buckets[index % groupCount].push(teamId));
  if (buckets.some((bucket) => bucket.length < 2)) throw new Error('NOT_ENOUGH_PARTICIPANTS_FOR_GROUPS');

  const stage = await tx.stage.create({
    data: { competitionId, type: 'GROUP', name: 'Fase de Grupos', order: 1, status: 'ACTIVE' },
  });
  const schedules = buckets.map((bucket) => generateRoundRobin(bucket, homeAway));
  const maxRounds = Math.max(...schedules.map((schedule) => schedule.length));
  const roundIds = new Map<number, string>();

  for (let number = 1; number <= maxRounds; number += 1) {
    const round = await tx.round.create({
      data: {
        stageId: stage.id,
        number,
        name: `Grupos · Rodada ${number}`,
        status: number === 1 ? 'ACTIVE' : 'PENDING',
      },
    });
    roundIds.set(number, round.id);
  }

  let matchCount = 0;
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    const group = await tx.group.create({
      data: { stageId: stage.id, name: `Grupo ${String.fromCharCode(65 + index)}`, order: index + 1 },
    });
    await tx.groupTeam.createMany({
      data: bucket.map((teamId, seed) => ({ groupId: group.id, teamId, seed: seed + 1 })),
    });
    await initializeGroupStandings(tx, group.id, bucket);

    for (const roundSchedule of schedules[index]) {
      const roundId = roundIds.get(roundSchedule.number);
      if (!roundId || roundSchedule.matches.length === 0) continue;
      await tx.match.createMany({
        data: roundSchedule.matches.map((match) => ({
          competitionId,
          stageId: stage.id,
          groupId: group.id,
          roundId,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
        })),
      });
      matchCount += roundSchedule.matches.length;
    }
  }

  return matchCount;
}

competitionStartV2.post('/:id/start', async (c) => {
  const db = c.get('prisma');
  const host = c.get('user');
  const competitionId = c.req.param('id');
  const requestId = crypto.randomUUID();

  try {
    const result = await db.$transaction(async (tx) => {
      await lockCompetition(tx, competitionId);
      const competition = await tx.competition.findUnique({
        where: { id: competitionId },
        select: {
          id: true,
          hostId: true,
          status: true,
          type: true,
          format: true,
          groupCount: true,
          legFormat: true,
          _count: { select: { matches: true } },
          participations: {
            where: { status: 'ACTIVE' },
            orderBy: { joinedAt: 'asc' },
            select: {
              id: true,
              userId: true,
              teamName: true,
              teamLogoUrl: true,
              team: { select: { id: true } },
              user: { select: { name: true, displayName: true } },
            },
          },
        },
      });

      if (!competition) return { ok: false as const, failure: failure('COMPETITION_NOT_FOUND') };
      if (competition.hostId !== host.id) return { ok: false as const, failure: failure('HOST_ONLY') };
      if (!['REGISTRATION', 'READY'].includes(competition.status)) {
        return { ok: false as const, failure: failure('COMPETITION_ALREADY_STARTED') };
      }
      if (competition._count.matches > 0) return { ok: false as const, failure: failure('MATCHES_ALREADY_EXIST') };
      if (competition.participations.length < 2) return { ok: false as const, failure: failure('NOT_ENOUGH_PARTICIPANTS') };

      const ensured = [] as Array<{ teamId: string; created: boolean }>;
      for (const participation of competition.participations) {
        ensured.push(await ensureParticipantTeam(tx, competitionId, participation));
      }
      const teamIds = ensured.map((entry) => entry.teamId);
      const repairedTeams = ensured.filter((entry) => entry.created).length;
      if (teamIds.length !== competition.participations.length) {
        throw new Error('PARTICIPATION_TEAM_REPAIR_INCOMPLETE');
      }

      const isGroupStage = competition.format === 'GROUP_STAGE' || competition.type === 'GROUPS_KNOCKOUT';
      const groupCount = isGroupStage ? effectiveGroupCount(competition.groupCount, teamIds.length) : null;
      if (isGroupStage && !groupCount) {
        return { ok: false as const, failure: failure('NOT_ENOUGH_PARTICIPANTS_FOR_GROUPS') };
      }

      const claimed = await tx.competition.updateMany({
        where: { id: competitionId, hostId: host.id, status: { in: ['REGISTRATION', 'READY'] } },
        data: {
          status: 'IN_PROGRESS',
          startsAt: new Date(),
          ...(isGroupStage && groupCount ? { groupCount, qualifiersPerGroup: 2 } : {}),
        },
      });
      if (claimed.count !== 1) return { ok: false as const, failure: failure('START_CONFLICT') };

      const randomized = shuffled(teamIds);
      const homeAway = competition.legFormat === 'HOME_AWAY';
      let matchCount: number;
      if (isGroupStage && groupCount) {
        matchCount = await buildGroups(tx, competitionId, randomized, groupCount, homeAway);
      } else if (competition.type === 'LEAGUE') {
        matchCount = await buildLeague(tx, competitionId, randomized, homeAway);
      } else {
        matchCount = await buildKnockout(tx, competitionId, randomized, homeAway);
      }

      if (matchCount < 1) throw new Error('NO_MATCHES_GENERATED');
      return {
        ok: true as const,
        status: 'IN_PROGRESS' as const,
        matchCount,
        repairedTeams,
        effectiveGroupCount: groupCount,
      };
    }, { maxWait: 15000, timeout: 30000 });

    if (!result.ok) {
      console.info('[competition.start.v2] rejected', {
        requestId,
        competitionId,
        hostId: host.id,
        error: result.failure.error,
        message: result.failure.message,
      });
      return c.json({ error: result.failure.error, message: result.failure.message, requestId }, result.failure.status);
    }

    console.info('[competition.start.v2] started', {
      requestId,
      competitionId,
      hostId: host.id,
      matchCount: result.matchCount,
      repairedTeams: result.repairedTeams,
      effectiveGroupCount: result.effectiveGroupCount,
    });
    return c.json({
      status: result.status,
      matchCount: result.matchCount,
      repairedTeams: result.repairedTeams,
      effectiveGroupCount: result.effectiveGroupCount,
      requestId,
    });
  } catch (error) {
    const semantic = error instanceof Error ? error.message : String(error);
    const mapped = semantic === 'NOT_ENOUGH_PARTICIPANTS_FOR_GROUPS'
      ? failure('NOT_ENOUGH_PARTICIPANTS_FOR_GROUPS')
      : semantic === 'KNOCKOUT_GENERATION_FAILED'
        ? failure('KNOCKOUT_GENERATION_FAILED')
        : null;

    console.error('[competition.start.v2] failed', {
      requestId,
      competitionId,
      hostId: host.id,
      prisma: safePrismaMeta(error),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: semantic,
    });

    if (mapped) return c.json({ error: mapped.error, message: mapped.message, requestId }, mapped.status);
    return c.json({
      error: 'START_FAILED',
      message: semantic || 'Falha inesperada ao gerar as partidas.',
      requestId,
      ...(error instanceof Prisma.PrismaClientKnownRequestError ? { prismaCode: error.code } : {}),
    }, 500);
  }
});
