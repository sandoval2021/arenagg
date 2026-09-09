import type { Prisma } from '@prisma/client';
import { calculateStandings } from '../domain/standings/calculate';

export type DbTx = Prisma.TransactionClient;

export async function syncGroupStandings(tx: DbTx, groupId: string): Promise<void> {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: {
      teams: { select: { teamId: true } },
      matches: {
        where: {
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
      },
    },
  });
  if (!group) return;

  const standings = calculateStandings(
    group.teams.map((entry) => entry.teamId),
    group.matches.map((match) => ({
      homeTeamId: match.homeTeamId!,
      awayTeamId: match.awayTeamId!,
      homeScore: match.homeScore!,
      awayScore: match.awayScore!,
    })),
  );

  // GroupStanding is a derived rollup. Replacing one small group is cheaper and
  // less error-prone than incrementing counters across score corrections/W.O.
  await tx.groupStanding.deleteMany({ where: { groupId } });
  if (standings.length > 0) {
    await tx.groupStanding.createMany({
      data: standings.map((standing) => ({ groupId, ...standing })),
    });
  }
}

export async function syncGroupStandingsForMatch(tx: DbTx, matchId: string): Promise<void> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: { groupId: true },
  });
  if (match?.groupId) await syncGroupStandings(tx, match.groupId);
}

export async function initializeGroupStandings(
  tx: DbTx,
  groupId: string,
  teamIds: readonly string[],
): Promise<void> {
  if (teamIds.length === 0) return;
  await tx.groupStanding.createMany({
    data: teamIds.map((teamId) => ({ groupId, teamId })),
    skipDuplicates: true,
  });
}
