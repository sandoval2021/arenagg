import {
  apiRequest,
  type CompetitionDetail,
  type CompetitionFormat,
  type TeamSelection,
} from './api';

export type PrizeDistribution = {
  first: number;
  second: number;
  third: number;
};

export type PhaseThreeMatch = CompetitionDetail['matches'][number] & {
  homeReady: boolean;
  awayReady: boolean;
  homeReadyAt: string | null;
  awayReadyAt: string | null;
  walkoverWinnerTeamId: string | null;
  walkoverAppliedAt: string | null;
};

export type PhaseThreeCompetitionDetail = Omit<CompetitionDetail, 'matches'> & {
  entryFee: number;
  prizeDistribution: string;
  matches: PhaseThreeMatch[];
};

export type CreateCompetitionPhaseThreeInput = {
  name: string;
  type: Exclude<CompetitionFormat, 'ENDLESS'>;
  format?: 'KNOCKOUT' | 'GROUP_STAGE';
  groupCount?: 2 | 4 | 8;
  game: string;
  platform: string;
  isHomeAndAway: boolean;
  teamSelection: TeamSelection;
  maxParticipants: number;
  matchPace: 'QUICK' | 'SCHEDULED';
  requireValidation: boolean;
  entryFee: number;
  prizeDistribution: string;
};

export function parsePrizeDistribution(value: string | null | undefined): PrizeDistribution {
  const [first = 60, second = 30, third = 10] = (value ?? '60,30,10')
    .split(',')
    .map((part) => Number(part));

  if (
    ![first, second, third].every((part) => Number.isInteger(part) && part >= 0 && part <= 100) ||
    first + second + third !== 100
  ) {
    return { first: 60, second: 30, third: 10 };
  }

  return { first, second, third };
}

export function createCompetitionPhaseThree(input: CreateCompetitionPhaseThreeInput) {
  return apiRequest<{ id: string; name: string }>('/api/competitions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getPhaseThreeCompetition(competitionId: string): Promise<PhaseThreeCompetitionDetail> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}`);
}

export function updateCompetitionPrize(
  competitionId: string,
  input: { entryFee: number; prizeDistribution: string },
): Promise<{ entryFee: number; prizeDistribution: string }> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/prize`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function markMatchReady(matchId: string): Promise<{
  homeReady: boolean;
  awayReady: boolean;
  homeReadyAt: string | null;
  awayReadyAt: string | null;
}> {
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/ready`, {
    method: 'POST',
  });
}

export function applyWalkover(
  matchId: string,
  input: { winner: 'AUTO' | 'HOME' | 'AWAY'; version: number },
): Promise<{
  id: string;
  status: string;
  version: number;
  homeScore: number;
  awayScore: number;
  homeReady: boolean;
  awayReady: boolean;
  walkoverWinnerTeamId: string;
  walkoverAppliedAt: string;
}> {
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/walkover`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
