import type { Prisma } from '@prisma/client';

type ScorerInput = {
  side: 'HOME' | 'AWAY';
  playerName: string;
  goals: number;
};

type MatchTeams = {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

function normalizePlayerKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ');
}

export async function replaceMatchScorers(
  tx: Prisma.TransactionClient,
  match: MatchTeams,
  scorers: ScorerInput[],
): Promise<void> {
  if (scorers.length > 0 && (!match.homeTeamId || !match.awayTeamId)) {
    throw new Error('MATCH_TEAMS_NOT_READY');
  }

  const grouped = new Map<string, { teamId: string; playerName: string; playerKey: string; goals: number }>();

  for (const scorer of scorers) {
    const teamId = scorer.side === 'HOME' ? match.homeTeamId : match.awayTeamId;
    if (!teamId) throw new Error('MATCH_TEAMS_NOT_READY');

    const playerName = scorer.playerName.trim();
    const playerKey = normalizePlayerKey(playerName);
    const key = `${teamId}:${playerKey}`;
    const previous = grouped.get(key);

    if (previous) {
      previous.goals += scorer.goals;
      previous.playerName = playerName;
    } else {
      grouped.set(key, { teamId, playerName, playerKey, goals: scorer.goals });
    }
  }

  await tx.matchScorer.deleteMany({ where: { matchId: match.id } });

  if (grouped.size === 0) return;

  await tx.matchScorer.createMany({
    data: [...grouped.values()].map((scorer) => ({
      matchId: match.id,
      ...scorer,
    })),
  });
}
