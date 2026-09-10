import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import type { Env } from '../types/env';
import { createCompetitionSchema, updateMyTeamSchema } from '../schemas/competition.schema';
import { generateRoundRobin } from '../domain/matchmaking/roundRobin';
import { generateKnockout } from '../domain/bracket/knockout';
import { calculateStandings } from '../domain/standings/calculate';

export const competitions = new Hono<Env>();

type DbTransaction = Prisma.TransactionClient;

type RouteError =
  | 'COMPETITION_NOT_FOUND'
  | 'REGISTRATION_CLOSED'
  | 'COMPETITION_FULL'
  | 'NOT_A_PARTICIPANT'
  | 'TEAM_CONFIGURATION_LOCKED'
  | 'TEAM_CONFIGURATION_NOT_ALLOWED'
  | 'TEAM_NAME_TAKEN'
  | 'HOST_ONLY'
  | 'COMPETITION_ALREADY_STARTED'
  | 'MATCHES_ALREADY_EXIST'
  | 'NOT_ENOUGH_PARTICIPANTS'
  | 'START_CONFLICT';

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

  const team = await tx.team.create({
    data: {
      competitionId,
      participationId,
      createdById: user.id,
      name,
    },
  });

  await tx.participation.update({
    where: { id: participationId },
    data: { teamName: name, teamLogoUrl: null },
  });

  return team;
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

  const slots = generateKnockout(teamIds);
  const bracketSize = 2 ** Math.ceil(Math.log2(teamIds.length));
  let cursor = 0;
  let slotsInRound = bracketSize / 2;
  let roundNumber = 1;
  const firstLegMatchByPosition = new Map<number, string>();

  while (slotsInRound >= 1) {
    const round = await tx.round.create({
      data: {
        stageId: stage.id,
        number: roundNumber,
        name: `Rodada ${roundNumber}`,
        status: roundNumber === 1 ? 'ACTIVE' : 'PENDING',
      },
    });

    const roundSlots = slots.slice(cursor, cursor + slotsInRound);
    for (const slot of roundSlots) {
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
      });
      firstLegMatchByPosition.set(slot.position, firstLeg.id);

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

    cursor += slotsInRound;
    slotsInRound /= 2;
    roundNumber += 1;
  }

  if (!homeAway) {
    for (const slot of slots) {
      if (!slot.nextPosition) continue;
      const matchId = firstLegMatchByPosition.get(slot.position);
      const nextMatchId = firstLegMatchByPosition.get(slot.nextPosition);
      if (matchId && nextMatchId) {
        await tx.match.update({ where: { id: matchId }, data: { nextMatchId } });
      }
    }
  }

  // TODO(Bracket): exibir e resolver progressão agregada de ida/volta na Árvore de Mata-Mata.
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

function routeError(error: RouteError | undefined) {
  if (!error) return { status: 500 as const, body: { error: 'INTERNAL_SERVER_ERROR' } };

  switch (error) {
    case 'COMPETITION_NOT_FOUND':
      return { status: 404 as const, body: { error } };
    case 'HOST_ONLY':
    case 'NOT_A_PARTICIPANT':
      return { status: 403 as const, body: { error } };
    case 'COMPETITION_FULL':
    case 'REGISTRATION_CLOSED':
    case 'TEAM_CONFIGURATION_LOCKED':
    case 'TEAM_CONFIGURATION_NOT_ALLOWED':
    case 'TEAM_NAME_TAKEN':
    case 'COMPETITION_ALREADY_STARTED':
    case 'MATCHES_ALREADY_EXIST':
    case 'NOT_ENOUGH_PARTICIPANTS':
    case 'START_CONFLICT':
      return { status: 409 as const, body: { error } };
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
      maxParticipants: competition.maxParticipants,
      currentRound: competition.stages.flatMap((stage) => stage.rounds)[0]?.number,
      status: competition.status,
      logoUrl: competition.logoUrl ?? undefined,
      game: competition.game,
      platform: competition.platform,
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
        game: input.game,
        platform: input.platform,
        legFormat: input.isHomeAndAway ? 'HOME_AWAY' : 'SINGLE',
        matchPace: input.matchPace,
        teamSelection: input.teamSelection,
        maxParticipants: input.maxParticipants,
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
  const operationsView = c.req.query('view') === 'operations';
  const where: Prisma.CompetitionWhereInput = {
    id,
    OR: [
      { hostId: user.id },
      { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
    ],
  };
  const baseInclude = {
    host: { select: { id: true, name: true, displayName: true } },
    stages: {
      orderBy: { order: 'asc' as const },
      select: { id: true, type: true, status: true, order: true },
    },
    participations: {
      where: { status: 'ACTIVE' as const },
      orderBy: { joinedAt: 'asc' as const },
      select: {
        id: true,
        userId: true,
        teamName: true,
        teamLogoUrl: true,
        user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        team: { select: { id: true, name: true, logoUrl: true } },
      },
    },
  } satisfies Prisma.CompetitionInclude;

  if (!operationsView) {
    const competition = await db.competition.findFirst({ where, include: baseInclude });
    if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

    return c.json({
      ...competition,
      matches: [],
      currentUserId: user.id,
      isHost: competition.hostId === user.id,
      hasJoined: competition.participations.some((participation) => participation.userId === user.id),
      hasKnockoutStage: competition.stages.some((stage) => stage.type === 'KNOCKOUT'),
    });
  }

  const competition = await db.competition.findFirst({
    where,
    include: {
      ...baseInclude,
      matches: {
        where: { status: { not: 'FINISHED' } },
        take: 120,
        orderBy: [{ round: { number: 'asc' } }, { bracketPosition: 'asc' }, { leg: 'asc' }],
        include: {
          round: { select: { id: true, number: true, name: true } },
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
  });

  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  return c.json({
    ...competition,
    matches: competition.matches.map((match) => ({
      ...match,
      homeTeam: match.homeTeam
        ? {
            id: match.homeTeam.id,
            name: match.homeTeam.name,
            logoUrl: match.homeTeam.logoUrl ?? match.homeTeam.participation.teamLogoUrl ?? null,
            user: { avatarUrl: match.homeTeam.participation.user.avatarUrl },
          }
        : null,
      awayTeam: match.awayTeam
        ? {
            id: match.awayTeam.id,
            name: match.awayTeam.name,
            logoUrl: match.awayTeam.logoUrl ?? match.awayTeam.participation.teamLogoUrl ?? null,
            user: { avatarUrl: match.awayTeam.participation.user.avatarUrl },
          }
        : null,
    })),
    currentUserId: user.id,
    isHost: competition.hostId === user.id,
    hasJoined: competition.participations.some((participation) => participation.userId === user.id),
    hasKnockoutStage: competition.stages.some((stage) => stage.type === 'KNOCKOUT'),
  });
});

competitions.get('/:id/matches', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');
  const rawRound = c.req.query('round');
  const requestedRound = rawRound ? Number(rawRound) : null;
  if (requestedRound !== null && (!Number.isInteger(requestedRound) || requestedRound < 1)) {
    return c.json({ error: 'INVALID_ROUND' }, 400);
  }

  const accessWhere: Prisma.CompetitionWhereInput = {
    id,
    OR: [
      { hostId: user.id },
      { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
    ],
  };

  const [competition, roundRows] = await Promise.all([
    db.competition.findFirst({ where: accessWhere, select: { id: true } }),
    db.round.findMany({
      where: { stage: { competitionId: id, status: 'ACTIVE' } },
      select: { id: true, number: true, status: true },
      orderBy: { number: 'asc' },
    }),
  ]);
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const rounds = [...new Set(roundRows.map((round) => round.number))].sort((a, b) => a - b);
  const currentRound = roundRows.find((round) => round.status === 'ACTIVE')?.number ?? rounds[0] ?? null;
  const selectedRound = requestedRound ?? currentRound;
  if (selectedRound === null) return c.json({ items: [], round: null, rounds: [], hasMore: false });
  if (!rounds.includes(selectedRound)) return c.json({ error: 'ROUND_NOT_FOUND' }, 404);

  const roundIds = roundRows.filter((round) => round.number === selectedRound).map((round) => round.id);
  const rows = await db.match.findMany({
    where: { competitionId: id, roundId: { in: roundIds } },
    take: 41,
    orderBy: [{ bracketPosition: 'asc' }, { leg: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      status: true,
      leg: true,
      version: true,
      homeTeamName: true,
      awayTeamName: true,
      homeScore: true,
      awayScore: true,
      round: { select: { id: true, number: true, name: true } },
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
  });

  const visible = rows.slice(0, 40).map((match) => ({
    ...match,
    homeTeam: match.homeTeam
      ? {
          id: match.homeTeam.id,
          name: match.homeTeam.name,
          logoUrl: match.homeTeam.logoUrl ?? match.homeTeam.participation.teamLogoUrl ?? null,
          user: { avatarUrl: match.homeTeam.participation.user.avatarUrl },
        }
      : null,
    awayTeam: match.awayTeam
      ? {
          id: match.awayTeam.id,
          name: match.awayTeam.name,
          logoUrl: match.awayTeam.logoUrl ?? match.awayTeam.participation.teamLogoUrl ?? null,
          user: { avatarUrl: match.awayTeam.participation.user.avatarUrl },
        }
      : null,
  }));

  return c.json({ items: visible, round: selectedRound, rounds, hasMore: rows.length > 40 });
});

competitions.patch('/:id/my-team', async (c) => {
  const parsed = updateMyTeamSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);

  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');
  const teamName = parsed.data.teamName;
  const teamLogoUrl = parsed.data.teamLogoUrl || null;

  const result = await db.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({
      where: { id },
      select: { status: true, teamSelection: true },
    });
    if (!competition) return { error: 'COMPETITION_NOT_FOUND' as const };
    if (!['REGISTRATION', 'READY'].includes(competition.status)) {
      return { error: 'TEAM_CONFIGURATION_LOCKED' as const };
    }
    if (competition.teamSelection !== 'FREE') {
      return { error: 'TEAM_CONFIGURATION_NOT_ALLOWED' as const };
    }

    const participation = await tx.participation.findUnique({
      where: { competitionId_userId: { competitionId: id, userId: user.id } },
      include: { team: true },
    });
    if (!participation || participation.status !== 'ACTIVE') {
      return { error: 'NOT_A_PARTICIPANT' as const };
    }

    const collision = await tx.team.findFirst({
      where: {
        competitionId: id,
        name: teamName,
        ...(participation.team ? { NOT: { id: participation.team.id } } : {}),
      },
      select: { id: true },
    });
    if (collision) return { error: 'TEAM_NAME_TAKEN' as const };

    await tx.participation.update({
      where: { id: participation.id },
      data: { teamName, teamLogoUrl },
    });

    if (participation.team) {
      await tx.team.update({
        where: { id: participation.team.id },
        data: { name: teamName, logoUrl: teamLogoUrl },
      });
    } else {
      await tx.team.create({
        data: {
          competitionId: id,
          participationId: participation.id,
          createdById: user.id,
          name: teamName,
          logoUrl: teamLogoUrl,
        },
      });
    }

    return { teamName, teamLogoUrl };
  });

  if ('error' in result) {
    const mapped = routeError(result.error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json(result);
});

competitions.post('/:id/start', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');

  // ÚNICO gatilho de matchmaking: esta rota só é chamada explicitamente pelo botão do Host.
  // Entrar no lobby nunca gera partidas nem altera o status para IN_PROGRESS.
  const result = await db.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({
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

    if (!competition) return { error: 'COMPETITION_NOT_FOUND' as const };
    if (competition.hostId !== user.id) return { error: 'HOST_ONLY' as const };
    if (!['REGISTRATION', 'READY'].includes(competition.status)) {
      return { error: 'COMPETITION_ALREADY_STARTED' as const };
    }
    if (competition._count.matches > 0) return { error: 'MATCHES_ALREADY_EXIST' as const };

    const teamIds = competition.participations
      .map((participation) => participation.team?.id)
      .filter((teamId): teamId is string => Boolean(teamId));
    if (teamIds.length < 2) return { error: 'NOT_ENOUGH_PARTICIPANTS' as const };

    const claimed = await tx.competition.updateMany({
      where: {
        id,
        hostId: user.id,
        status: { in: ['REGISTRATION', 'READY'] },
      },
      data: { status: 'IN_PROGRESS' },
    });
    if (claimed.count !== 1) return { error: 'START_CONFLICT' as const };

    const randomizedTeamIds = shuffled(teamIds);
    const homeAway = competition.legFormat === 'HOME_AWAY';

    if (competition.type === 'LEAGUE') {
      await buildLeague(tx, id, randomizedTeamIds, homeAway);
    } else if (competition.type === 'GROUPS_KNOCKOUT') {
      await buildGroups(tx, id, randomizedTeamIds, homeAway);
    } else {
      await buildKnockout(tx, id, randomizedTeamIds, homeAway);
    }

    const matchCount = await tx.match.count({ where: { competitionId: id } });
    return { status: 'IN_PROGRESS' as const, matchCount };
  });

  if ('error' in result) {
    const mapped = routeError(result.error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json(result);
});

competitions.get('/:id/standings', async (c) => {
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
    select: {
      id: true,
      type: true,
      teams: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          participation: {
            select: {
              teamLogoUrl: true,
              user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  });
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const matches = await db.match.findMany({
    where: {
      competitionId: id,
      status: 'FINISHED',
      ...(competition.type === 'LEAGUE' ? { stage: { type: 'LEAGUE' as const } } : {}),
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

  const teamById = new Map(competition.teams.map((team) => [team.id, team]));
  return c.json(
    calculateStandings(competition.teams.map((team) => team.id), matches as never).map((row, index) => {
      const team = teamById.get(row.teamId);
      return {
        ...row,
        position: index + 1,
        team: team?.name ?? 'Time',
        logoUrl: team?.logoUrl ?? team?.participation.teamLogoUrl ?? undefined,
        user: team
          ? { id: team.participation.user.id, avatarUrl: team.participation.user.avatarUrl }
          : null,
        playerName:
          team?.participation.user.displayName ?? team?.participation.user.name ?? 'Jogador',
      };
    }),
  );
});
