import { apiRequest } from './api';

export type HeadToHeadSummary = {
  viewerWins: number;
  draws: number;
  opponentWins: number;
  totalMatches: number;
  competitionMatches: number;
  friendlyMatches: number;
  opponent: {
    id: string;
    name: string;
  };
  recentMatches: Array<{
    id: string;
    source: 'COMPETITION' | 'FRIENDLY';
    competitionId: string | null;
    competitionName: string;
    roomId: string | null;
    platform: string | null;
    occurredAt: string | null;
    viewerScore: number;
    opponentScore: number;
    viewerPenaltyScore: number | null;
    opponentPenaltyScore: number | null;
    result: 'WIN' | 'DRAW' | 'LOSS';
    viewerTeam: { name: string; logoUrl: string | null } | null;
    opponentTeam: { name: string; logoUrl: string | null } | null;
  }>;
};

export type CompetitionFeedItem =
  | {
      id: string;
      type: 'JOIN';
      occurredAt: string;
      user: { id: string; name: string; avatarUrl: string | null };
      team: { name: string; logoUrl: string | null };
    }
  | {
      id: string;
      type: 'MATCH_RESULT';
      occurredAt: string;
      tone: 'BLOWOUT' | 'WIN' | 'DRAW';
      winnerSide: 'HOME' | 'AWAY' | null;
      home: {
        userId: string;
        playerName: string;
        teamName: string;
        logoUrl: string | null;
        score: number;
        penaltyScore: number | null;
      };
      away: {
        userId: string;
        playerName: string;
        teamName: string;
        logoUrl: string | null;
        score: number;
        penaltyScore: number | null;
      };
    };

export type GlobalFriendlyFeedItem = {
  id: string;
  type: 'FRIENDLY_RESULT';
  roomId: string;
  occurredAt: string;
  tone: 'WIN' | 'DRAW';
  winnerSide: 'CHALLENGER' | 'CHALLENGED' | null;
  challenger: {
    userId: string;
    playerName: string;
    avatarUrl: string | null;
    platform: string;
    score: number;
  };
  challenged: {
    userId: string;
    playerName: string;
    avatarUrl: string | null;
    platform: string;
    score: number;
  };
};

export function getHeadToHead(userId: string): Promise<HeadToHeadSummary> {
  return apiRequest(`/api/profile/${encodeURIComponent(userId)}/head-to-head`);
}

export function getCompetitionFeed(competitionId: string): Promise<{ competitionId: string; items: CompetitionFeedItem[] }> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/feed`);
}

export function getGlobalFriendlyFeed(): Promise<{ items: GlobalFriendlyFeedItem[] }> {
  return apiRequest('/api/feed');
}
