import { apiRequest } from './api';

export type HostCancelableMatch = {
  id: string;
  status: string;
  version: number;
  homeName: string;
  awayName: string;
  stage: { id: string; type: 'LEAGUE' | 'GROUP' | 'KNOCKOUT'; name: string };
  round: { id: string; number: number; name: string | null } | null;
};

export type HostActionsSnapshot = {
  competitionId: string;
  competitionStatus: string;
  leagueStage: { id: string; type: string; status: string; order: number; name: string } | null;
  knockoutStage: { id: string; type: string; status: string; order: number; name: string } | null;
  teamCount: number;
  allowedPlayoffSizes: Array<4 | 8>;
  extraTurnCount: number;
  cancelableMatches: HostCancelableMatch[];
};

export type PlayoffMatch = {
  id: string;
  status: string;
  version: number;
  bracketPosition: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  homeTeam: { id: string; name: string; logoUrl: string | null } | null;
  awayTeam: { id: string; name: string; logoUrl: string | null } | null;
};

export type PlayoffSnapshot = {
  exists: boolean;
  competitionId: string;
  competitionName: string;
  stage: {
    id: string;
    name: string;
    order: number;
    status: string;
    rounds: Array<{
      id: string;
      number: number;
      name: string | null;
      status: string;
      matches: PlayoffMatch[];
    }>;
  } | null;
};

export function getHostActions(competitionId: string): Promise<HostActionsSnapshot> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/host-actions`);
}

export function cancelHostMatch(competitionId: string, matchId: string) {
  return apiRequest<{ canceled: true; alreadyCanceled: boolean; matchId: string }>(
    `/api/competitions/${encodeURIComponent(competitionId)}/host-actions/matches/${encodeURIComponent(matchId)}/cancel`,
    { method: 'POST' },
  );
}

export function startHostPlayoffs(competitionId: string, size: 4 | 8) {
  return apiRequest<{
    generated: true;
    playoffSize: 4 | 8;
    canceledPendingMatches: number;
    qualifiedTeamIds: string[];
    stageId: string;
    bracketMatchCount: number;
  }>(`/api/competitions/${encodeURIComponent(competitionId)}/host-actions/playoffs`, {
    method: 'POST',
    body: JSON.stringify({ size }),
  });
}

export function generateExtraTurn(competitionId: string) {
  return apiRequest<{
    generated: true;
    extraTurnNumber: number;
    roundsAdded: number;
    matchesAdded: number;
    firstNewRound: number;
    lastNewRound: number;
  }>(`/api/competitions/${encodeURIComponent(competitionId)}/host-actions/extra-turn`, {
    method: 'POST',
  });
}

export function getCompetitionPlayoffs(competitionId: string): Promise<PlayoffSnapshot> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/playoffs`);
}
