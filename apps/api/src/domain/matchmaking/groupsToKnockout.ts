import type { PrismaClient } from '@prisma/client';
import { calculateStandings, type FinishedMatch } from '../standings/calculate';
import { generateKnockout } from '../bracket/knockout';

type GroupQualifier = { groupId: string; groupName: string; first: string; second: string };

function crossGroupSeeds(groups: readonly GroupQualifier[]): string[] {
  if (groups.length < 2) throw new Error('AT_LEAST_TWO_GROUPS_REQUIRED');
  const seeds: string[] = [];
  for (let i = 0; i < groups.length; i += 2) {
    const a = groups[i];
    const b = groups[i + 1];
    if (!b) throw new Error('EVEN_GROUP_COUNT_REQUIRED');
    seeds.push(a.first, b.second, b.first, a.second);
  }
  return seeds;
}

export async function promoteGroupsToKnockout(prisma: PrismaClient, competitionId: string) {
  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({ where: { id: competitionId }, include: { stages: { orderBy: { order: 'asc' }, include: { groups: { orderBy: { order: 'asc' }, include: { teams: true, matches: true } } } } } });
    if (!competition) throw new Error('COMPETITION_NOT_FOUND');
    if (competition.type !== 'GROUPS_KNOCKOUT') throw new Error('INVALID_COMPETITION_TYPE');

    const groupStage = competition.stages.find((stage) => stage.type === 'GROUP');
    if (!groupStage) throw new Error('GROUP_STAGE_NOT_FOUND');
    if (groupStage.groups.length < 2) throw new Error('AT_LEAST_TWO_GROUPS_REQUIRED');

    const qualifiers: GroupQualifier[] = groupStage.groups.map((group) => {
      const teamIds = group.teams.map((entry) => entry.teamId);
      const unfinished = group.matches.some((match) => match.status !== 'FINISHED');
      if (unfinished) throw new Error(`GROUP_NOT_FINISHED:${group.name}`);
      const matches: FinishedMatch[] = group.matches.map((match) => {
        if (!match.homeTeamId || !match.awayTeamId || match.homeScore == null || match.awayScore == null) throw new Error(`INVALID_FINISHED_MATCH:${match.id}`);
        return { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, homeScore: match.homeScore, awayScore: match.awayScore };
      });
      const standings = calculateStandings(teamIds, matches);
      if (standings.length < 2) throw new Error(`INSUFFICIENT_GROUP_TEAMS:${group.name}`);
      return { groupId: group.id, groupName: group.name, first: standings[0].teamId, second: standings[1].teamId };
    });

    const seeds = crossGroupSeeds(qualifiers);
    const slots = generateKnockout(seeds);
    const knockoutStage = await tx.stage.upsert({
      where: { competitionId_order: { competitionId, order: groupStage.order + 1 } },
      create: { competitionId, type: 'KNOCKOUT', name: 'Mata-mata', order: groupStage.order + 1, status: 'ACTIVE' },
      update: { type: 'KNOCKOUT', name: 'Mata-mata', status: 'ACTIVE' },
    });

    const existing = await tx.match.count({ where: { competitionId, stageId: knockoutStage.id } });
    if (existing > 0) throw new Error('KNOCKOUT_ALREADY_GENERATED');

    const createdByPosition = new Map<number, string>();
    for (const slot of slots) {
      const match = await tx.match.create({ data: { competitionId, stageId: knockoutStage.id, bracketPosition: slot.position, homeTeamId: slot.homeTeamId, awayTeamId: slot.awayTeamId, status: slot.homeTeamId && slot.awayTeamId ? 'PENDING' : 'PENDING' } });
      createdByPosition.set(slot.position, match.id);
    }
    for (const slot of slots) {
      if (!slot.nextPosition || !slot.nextSlot) continue;
      const id = createdByPosition.get(slot.position);
      const nextMatchId = createdByPosition.get(slot.nextPosition);
      if (!id || !nextMatchId) throw new Error('INVALID_BRACKET_GRAPH');
      await tx.match.update({ where: { id }, data: { nextMatchId, nextMatchSlot: slot.nextSlot } });
    }

    await tx.stage.update({ where: { id: groupStage.id }, data: { status: 'FINISHED' } });
    return { knockoutStageId: knockoutStage.id, qualifiers, matchCount: slots.length };
  });
}
