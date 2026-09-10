import { apiRequest } from './api';

export type ReputationTag = 'RAGE_QUITTER' | 'TOXIC' | 'FAIR_PLAY';

export type ReputationSummary = {
  average: number;
  count: number;
  tags: Record<ReputationTag, number>;
};

export type PendingReputationReview = {
  matchId: string;
  finishedAt: string | null;
  opponent: {
    id: string;
    name: string;
    avatarUrl: string | null;
    teamName: string;
  };
};

export type GroupStandingRow = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  user: { id: string; name: string; displayName: string | null; avatarUrl: string | null };
  team: {
    name: string;
    logoUrl: string | null;
  };
};

export type GroupStageSnapshot = {
  competitionId: string;
  groupCount: number | null;
  groups: Array<{
    id: string;
    name: string;
    order: number;
    standings: GroupStandingRow[];
  }>;
  totalMatches: number;
  finishedMatches: number;
  groupStageFinished: boolean;
  knockoutGenerated: boolean;
  canGenerateKnockout: boolean;
};

export function getReputationSummary(userId: string): Promise<ReputationSummary> {
  return apiRequest(`/api/reputation/users/${encodeURIComponent(userId)}`);
}

export function getPendingReputationReview(competitionId: string): Promise<PendingReputationReview | null> {
  return apiRequest(`/api/reputation/pending/${encodeURIComponent(competitionId)}`);
}

export function submitReputationReview(
  matchId: string,
  input: { stars: number; tags: ReputationTag[] },
): Promise<{ id: string; stars: number; tags: ReputationTag[]; createdAt: string }> {
  return apiRequest(`/api/reputation/${encodeURIComponent(matchId)}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getGroupStageSnapshot(competitionId: string): Promise<GroupStageSnapshot> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/group-stage`);
}

export function generateGroupStageKnockout(
  competitionId: string,
): Promise<{ generated: true; qualifiedCount: number; bracketMatchCount: number }> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/generate-knockout`, {
    method: 'POST',
  });
}
