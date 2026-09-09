import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import type { Env } from '../types/env';
import { createCompetitionSchema } from '../schemas/competition.schema';
import { generateRoundRobin } from '../domain/matchmaking/roundRobin';
import { generateKnockout } from '../domain/bracket/knockout';
import { calculateStandings } from '../domain/standings/calculate';

export const competitions = new Hono<Env>();

type DbTransaction = Prisma.TransactionClient;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 56);

  return `${base || 'campeonato'}-${crypto.randomUUID().slice(0, 8)}`;
}

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [result[index], result[random]] = [result[random], result[index]];
  }
  return result;
}

async function createParticipantTeam(
  tx: DbTransaction,
  competitionId: string,
  user: Env['Variables']['user'],
  participationId: string,
) {
  const requested = (user.displayName ?? user.name).trim().slice(0, 60) || 'Jogador';
  const collision = await tx.team.findFirst({
    where: { competitionId, name: requested },
    select: { id: true },
  });
  const suffix = user.id.slice(0, 6);
  const name = collision ? `${requested.slice(0, 52)}-${suffix}` : requested;

  return tx.team.create({
    data: {
      competitionId,
      participationId,
      createdById: user.id,
      name,
    },
  });
}

async function buildLeague(
  tx: DbTransaction,
  competitionId: string,
  teamIds: string[],
  homeAway: boolean,
) {
  const stage = await tx.stage.create({
    data: {
      competitionId,
      type: 'LEAGUE',
      name: 'Liga',
      order: 1,
      status: 'ACTIVE',
    },
  });

  const schedule = generateRoundRobin(teamIds, homeAway);
  for (const roundSchedule of schedule) {
    const round = await tx.round.create({
      data: {
        stageId: stage.id,
        number: roundSchedule.number,
        status: roundSchedule.number === 1 ? 'ACTIVE' : 'PENDING',
      },
    });

    if (roundSchedule.matches.length > 0) {
      await tx.match.createMany({
        data: roundSchedule.matches.map((match) => ({
          competitionId,
          stageId: stage.id,
          roundId: round.id,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
        })),
      });
    }
  }
}

async function buildKnockout(
  tx: DbTransaction,
  competitionId: string,
  teamIds: string[],
  homeAway: boolean,
) {
  const stage = await tx.stage.create({
    data: {
      competitionId,
      type: 'KNOCKOUT',
      name: 'Mata-mata',
      order: 1,
      status: 'ACTIVE',
    },
  });
  const round = await tx.round.create({
    data: {
      stageId: stage.id,
      number: 1,
      name: 'Mata-mata',
      status: 'ACTIVE',
    },
  });

  for (const slot of generateKnockout(teamIds)) {
    await tx.match.create({
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

    if (homeAway) {
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
    }
  }
}

async function buildGroups(
  tx: DbTransaction,
  competitionId: string,
  teamIds: string[],
  homeAway: boolean,
) {
  if (teamIds.length < 4) {
    await buildKnockout(tx, competitionId, teamIds, homeAway);
    return;
  }

  const groupCount = Math.min(4, Math.max(2, Math.floor(teamIds.length / 4)));
  const buckets = Array.from({ length: groupCount }, () => [] as string[]);
  teamIds.forEach((teamId, index) => buckets[index % groupCount].push(teamId));

  const stage = await tx.stage.create({
    data: {
      competitionId,
      type: 'GROUP',
      name: 'Fase de grupos',
      order: 1,
      status: 'ACTIVE',
    },
  });

  const schedules = buckets.map((bucket) => generateRoundRobin(bucket, homeAway));
  const maxRounds = Math.max(...schedules.map((schedule) => schedule.length));
  const rounds = new Map<number, string>();

  for (let number = 1; number <= maxRounds; number += 1) {
    const round = await tx.round.create({
      data: {
        stageId: stage.id,
        number,
        status: number === 1 ? 'ACTIVE' : 'PENDING',
      },
    });
    rounds.set(number, round.id);
  }

  for (let index = 0; index < buckets.length; index += 1) {
    const group = await tx.group.create({
      data: {
        stageId: stage.id,
        name: `Grupo ${String.fromCharCode(65 + index)}`,
        order: index + 1,
      },
    });

    await tx.groupTeam.createMany({
      data: buckets[index].map((teamId, seed) => ({
        groupId: group.id,
        teamId,
        seed: seed + 1,
      })),
    });

    for (const roundSchedule of schedules[index]) {
      const roundId = rounds.get(roundSchedule.number);
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
    }
  }
}

competitions.get('/', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const rows = await db.competition.findMany({
    where: {
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    include: {
      participations: {
        where: { status: 'ACTIVE' },
        select: { id: true },
      },
      stages: {
        select: {
          rounds: {
            where: { status: 'ACTIVE' },
            select: { number: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return c.json(
    rows.map((competition) => ({
      id: competition.id,
      name: competition.name,
      format: competition.type,
      participantCount: competition.participations.length,
      currentRound: competition.stages.flatMap((stage) => stage.rounds)[0]?.number,
      status: competition.status,
      logoUrl: competition.logoUrl ?? undefined,
      isHost: competition.hostId === user.id,
    })),
  );
});

competitions.post('/', async (c) => {
  const parsed = createCompetitionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);
  }

  const db = c.get('prisma');
  const input = parsed.data;
  const host = c.get('user');

  const created = await db.$transaction(async (tx) => {
    const competition = await tx.competition.create({
      data: {
        hostId: host.id,
        name: input.name,
        slug: slugify(input.name),
        type: input.type,
        legFormat: input.isHomeAndAway ? 'HOME_AWAY' : 'SINGLE',
        matchPace: input.matchPace,
        teamSelection: input.teamSelection,
        requireValidation: input.requireValidation,
        status: 'REGISTRATION',
      },
    });

    const participation = await tx.participation.create({
      data: {
        competitionId: competition.id,
        userId: host.id,
        status: 'ACTIVE',
      },
    });
    await createParticipantTeam(tx, competition.id, host, participation.id);

    return competition;
  });

  return c.json(created, 201);
});

competitions.get('/:id', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');

  const competition = await db.competition.findFirst({
    where: {
      id,
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    include: {
      host: { select: { id: true, name: true, displayName: true } },
      participations: {
        where: { status: 'ACTIVE' },
        orderBy: { joinedAt: 'asc' },
        include: {
          user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
          team: { select: { id: true, name: true, logoUrl: true } },
        },
      },
      matches: {
        take: 100,
        orderBy: [{ bracketPosition: 'asc' }, { leg: 'asc' }, { createdAt: 'asc' }],
        include: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  return c.json({
    ...competition,
    isHost: competition.hostId === user.id,
    hasJoined: competition.participations.some((participation) => participation.userId === user.id),
  });
});

competitions.post('/:id/join', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');
  const competition = await db.competition.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);
  if (!['REGISTRATION', 'READY'].includes(competition.status)) {
    return c.json({ error: 'REGISTRATION_CLOSED' }, 409);
  }

  await db.$transaction(async (tx) => {
    let participation = await tx.participation.findUnique({
      where: { competitionId_userId: { competitionId: id, userId: user.id } },
      include: { team: true },
    });

    if (!participation) {
      participation = await tx.participation.create({
        data: { competitionId: id, userId: user.id, status: 'ACTIVE' },
        include: { team: true },
      });
    } else if (participation.status !== 'ACTIVE') {
      participation = await tx.participation.update({
        where: { id: participation.id },
        data: { status: 'ACTIVE', joinedAt: new Date() },
        include: { team: true },
      });
    }

    if (!participation.team) {
      await createParticipantTeam(tx, id, user, participation.id);
    }
  });

  return c.json({ joined: true });
});

competitions.post('/:id/start', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');

  const competition = await db.competition.findUnique({
    where: { id },
    include: {
      participations: {
        where: { status: 'ACTIVE' },
        include: { team: true },
        orderBy: { joinedAt: 'asc' },
      },
      _count: { select: { matches: true } },
    },
  });

  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);
  if (competition.hostId !== user.id) return c.json({ error: 'HOST_ONLY' }, 403);
  if (!['REGISTRATION', 'READY'].includes(competition.status)) {
    return c.json({ error: 'COMPETITION_ALREADY_STARTED' }, 409);
  }
  if (competition._count.matches > 0) return c.json({ error: 'MATCHES_ALREADY_EXIST' }, 409);

  const teamIds = competition.participations
    .map((participation) => participation.team?.id)
    .filter((teamId): teamId is string => Boolean(teamId));

  if (teamIds.length < 2) return c.json({ error: 'NOT_ENOUGH_PARTICIPANTS' }, 409);
  const randomizedTeamIds = shuffled(teamIds);
  const homeAway = competition.legFormat === 'HOME_AWAY';

  await db.$transaction(async (tx) => {
    const claimed = await tx.competition.updateMany({
      where: {
        id,
        hostId: user.id,
        status: { in: ['REGISTRATION', 'READY'] },
      },
      data: { status: 'IN_PROGRESS' },
    });

    if (claimed.count !== 1) throw new Error('START_CONFLICT');

    if (competition.type === 'LEAGUE') {
      await buildLeague(tx, id, randomizedTeamIds, homeAway);
    } else if (competition.type === 'GROUPS_KNOCKOUT') {
      await buildGroups(tx, id, randomizedTeamIds, homeAway);
    } else {
      await buildKnockout(tx, id, randomizedTeamIds, homeAway);
    }
  });

  const matchCount = await db.match.count({ where: { competitionId: id } });
  return c.json({ status: 'IN_PROGRESS', matchCount });
});

competitions.get('/:id/standings', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const competition = await db.competition.findUnique({ where: { id }, include: { teams: true } });
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const matches = await db.match.findMany({
    where: {
      competitionId: id,
      status: 'FINISHED',
      homeTeamId: { not: null },
      awayTeamId: { not: null },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
  });

  return c.json(
    calculateStandings(competition.teams.map((team) => team.id), matches as never).map((row, index) => ({
      ...row,
      position: index + 1,
      team: competition.teams.find((team) => team.id === row.teamId)?.name ?? 'Time',
    })),
  );
});
