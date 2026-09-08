export type CompetitionSummary = {
  id: string;
  name: string;
  format: 'LEAGUE' | 'KNOCKOUT' | 'GROUPS_KNOCKOUT';
  participantCount: number;
  currentRound?: number;
  status: 'REGISTRATION' | 'READY' | 'IN_PROGRESS' | 'FINISHED';
  logoUrl?: string;
};

export type Standing = {
  teamId: string;
  team: string;
  logoUrl?: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

const mockCompetitions: CompetitionSummary[] = [
  { id: 'champions-gg', name: 'Copa Champions GG', format: 'GROUPS_KNOCKOUT', participantCount: 8, currentRound: 4, status: 'IN_PROGRESS' },
  { id: 'liga-weekend', name: 'Liga Weekend', format: 'LEAGUE', participantCount: 12, currentRound: 6, status: 'IN_PROGRESS' },
];

const mockStandings: Standing[] = [
  { teamId: '1', team: 'Real Madrid', points: 15, played: 6, wins: 5, draws: 0, losses: 1, goalsFor: 18, goalsAgainst: 7, goalDifference: 11 },
  { teamId: '2', team: 'Arsenal', points: 13, played: 6, wins: 4, draws: 1, losses: 1, goalsFor: 14, goalsAgainst: 8, goalDifference: 6 },
  { teamId: '3', team: 'Bayern', points: 10, played: 6, wins: 3, draws: 1, losses: 2, goalsFor: 12, goalsAgainst: 9, goalDifference: 3 },
  { teamId: '4', team: 'Barcelona', points: 7, played: 6, wins: 2, draws: 1, losses: 3, goalsFor: 9, goalsAgainst: 12, goalDifference: -3 },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getMyCompetitions(): Promise<CompetitionSummary[]> {
  await wait(250);
  return mockCompetitions;
}

export async function getStandings(_competitionId: string): Promise<Standing[]> {
  await wait(250);
  return mockStandings;
}
