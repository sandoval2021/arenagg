import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import type { Env } from '../types/env';
import { generateKnockout } from '../domain/bracket/knockout';
import { syncGroupStandings } from '../services/group-stage.service';
import { sendPushToUsers } from '../services/push.service';

export const phaseSixCompetitions = new Hono<Env>();
type Tx = Prisma.TransactionClient;

async function lockCompetition(tx: Tx, competitionId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`group-stage:${competitionId}`}))`;
}

async function createKnockoutStage(
  tx: Tx,
  competitionId: string,
  teamIds: readonly string[],
  order: number,
): Promise<number> {
  const stage = await tx.stage.create({
    data: {
      competitionId,
      type: 'KNOCKOUT',
      name: 'Mata-mata',
      order,
      status: 'ACTIVE',
    },
  });

  const slots = generateKnockout(teamIds);
  const bracketSize = 2 ** Math.ceil(Math.log2(teamIds.length));
  let cursor = 0;
  let slotsInRound = bracketSize / 2;
  let roundNumber = 1;
  const matchByPosition = new Map<number, string>();

  while (slotsInRound >= 1) {
    const round = await tx.round.create({
      data: {
        stageId: stage.id,
        number: roundNumber,
        name: roundNumber === Math.log2(bracketSize) ? 'Final' : `Mata-mata · Rodada ${roundNumber}`,
        status: roundNumber === 1 ? 'ACTIVE' : 'PENDING',
      },
    });

    const roundSlots = slots.slice(cursor, cursor + slotsInRound);
    for (const slot of roundSlots) {
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

  return slots.length;
}

function seedQualifiedTeams(groups: Array<{ standings: Array<{ teamId: string }> }>): string[] {
  const winners = groups.map((group) => group.standings[0]?.teamId).filter((id): id is string => Boolean(id));
  const runners = groups.map((group) => group.standings[1]?.teamId).filter((id): id is string => Boolean(id));
  if (winners.length !== groups.length || runners.length !== groups.length) return [];

  // A1 x B2, B1 x C2, ... avoids an immediate rematch from the same group.
  const seeded: string[] = [];
  for (let index = 0; index < winners.length; index += 1) {
    seeded.push(winners[index], runners[(index + 1) % runners.length]);
  }
  return seeded;
}

phaseSixCompetitions.get('/:id/group-stage', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');
  const competition = await db.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    select: {
      id: true,
      name: true,
      hostId: true,
      format: true,
      type: true,
      groupCount: true,
      stages: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          type: true,
          status: true,
          order: true,
          groups: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              name: true,
              order: true,
              standings: {
                orderBy: [
                  { points: 'desc' },
                  { wins: 'desc' },
                  { goalDifference: 'desc' },
                  { goalsFor: 'desc' },
                  { teamId: 'asc' },
                ],
                select: {
                  teamId: true,
                  played: true,
                  wins: true,
                  draws: true,
                  losses: true,
                  goalsFor: true,
                  goalsAgainst: true,
                  goalDifference: true,
                  points: true,
                  team: {
                    select: {
                      name: true,
                      logoUrl: true,
                      participation: {
                        select: {
                          user: { select: { id: true, name: true, displayName: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);
  if (competition.format !== 'GROUP_STAGE' && competition.type !== 'GROUPS_KNOCKOUT') {
    return c.json({ error: 'NOT_GROUP_STAGE' }, 409);
  }

  const groupStage = competition.stages.find((stage) => stage.type === 'GROUP');
  const knockoutStage = competition.stages.find((stage) => stage.type === 'KNOCKOUT');
  const [totalMatches, unfinishedMatches] = groupStage
    ? await Promise.all([
        db.match.count({ where: { competitionId, stageId: groupStage.id } }),
        db.match.count({ where: { competitionId, stageId: groupStage.id, status: { not: 'FINISHED' } } }),
      ])
    : [0, 0];

  return c.json({
    competitionId,
    groupCount: competition.groupCount,
    groups: groupStage?.groups ?? [],
    totalMatches,
    finishedMatches: totalMatches - unfinishedMatches,
    groupStageFinished: totalMatches > 0 && unfinishedMatches === 0,
    knockoutGenerated: Boolean(knockoutStage),
    canGenerateKnockout:
      competition.hostId === user.id
      && totalMatches > 0
      && unfinishedMatches === 0
      && !knockoutStage,
  });
});

phaseSixCompetitions.post('/:id/generate-knockout', async (c) => {
  const db = c.get('prisma');
  const host = c.get('user');
  const competitionId = c.req.param('id');

  const result = await db.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const competition = await tx.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        name: true,
        hostId: true,
        status: true,
        format: true,
        type: true,
        stages: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            type: true,
            order: true,
            groups: { orderBy: { order: 'asc' }, select: { id: true, name: true, order: true } },
          },
        },
        participations: {
          where: { status: 'ACTIVE' },
          select: { userId: true },
        },
      },
    });
    if (!competition) return { error: 'COMPETITION_NOT_FOUND' as const };
    if (competition.hostId !== host.id) return { error: 'HOST_ONLY' as const };
    if (competition.format !== 'GROUP_STAGE' && competition.type !== 'GROUPS_KNOCKOUT') {
      return { error: 'NOT_GROUP_STAGE' as const };
    }
    if (competition.status !== 'IN_PROGRESS') return { error: 'COMPETITION_NOT_IN_PROGRESS' as const };
    if (competition.stages.some((stage) => stage.type === 'KNOCKOUT')) {
      return { error: 'KNOCKOUT_ALREADY_GENERATED' as const };
    }

    const groupStage = competition.stages.find((stage) => stage.type === 'GROUP');
    if (!groupStage || groupStage.groups.length < 2) return { error: 'GROUP_STAGE_NOT_READY' as const };
    const totalMatches = await tx.match.count({ where: { competitionId, stageId: groupStage.id } });
    const unfinished = await tx.match.count({
      where: { competitionId, stageId: groupStage.id, status: { not: 'FINISHED' } },
    });
    if (totalMatches === 0 || unfinished > 0) return { error: 'GROUP_MATCHES_PENDING' as const };

    for (const group of groupStage.groups) await syncGroupStandings(tx, group.id);
    const groups = await tx.group.findMany({
      where: { stageId: groupStage.id },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        standings: {
          orderBy: [
            { points: 'desc' },
            { wins: 'desc' },
            { goalDifference: 'desc' },
            { goalsFor: 'desc' },
            { teamId: 'asc' },
          ],
          take: 2,
          select: { teamId: true },
        },
      },
    });
    if (groups.some((group) => group.standings.length < 2)) {
      return { error: 'GROUP_NEEDS_TWO_QUALIFIERS' as const };
    }

    const qualified = seedQualifiedTeams(groups);
    if (qualified.length !== groups.length * 2 || (qualified.length & (qualified.length - 1)) !== 0) {
      return { error: 'INVALID_QUALIFIER_COUNT' as const };
    }

    const nextOrder = Math.max(...competition.stages.map((stage) => stage.order), 0) + 1;
    const bracketMatchCount = await createKnockoutStage(tx, competitionId, qualified, nextOrder);
    await tx.stage.update({ where: { id: groupStage.id }, data: { status: 'FINISHED' } });

    return {
      competitionName: competition.name,
      participantUserIds: competition.participations.map((entry) => entry.userId),
      qualifiedCount: qualified.length,
      bracketMatchCount,
    };
  });

  if ('error' in result) {
    const status = result.error === 'COMPETITION_NOT_FOUND' ? 404 : result.error === 'HOST_ONLY' ? 403 : 409;
    return c.json({ error: result.error }, status);
  }

  try {
    await sendPushToUsers(db, c.env, result.participantUserIds.filter((id) => id !== host.id), {
      title: '🏆 Mata-mata liberado!',
      body: `${result.competitionName}: os classificados já estão na chave decisiva.`,
      url: `/competitions/${competitionId}`,
      tag: `knockout-${competitionId}`,
    });
  } catch (error) {
    console.warn('[push] knockout generated notification failed', error);
  }

  return c.json({
    generated: true,
    qualifiedCount: result.qualifiedCount,
    bracketMatchCount: result.bracketMatchCount,
  }, 201);
});
