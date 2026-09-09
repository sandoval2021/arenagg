import { apiRequest } from './api';

export type CompetitionChatMessage = {
  id: string;
  competitionId: string;
  userId: string;
  body: string;
  createdAt: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  mmr: number;
};

export type MatchDispute = {
  matchId: string;
  status: string;
  version: number;
  original: {
    homeScore: number | null;
    awayScore: number | null;
    submittedById: string | null;
    evidenceUrl: string | null;
  };
  contest: {
    homeScore: number | null;
    awayScore: number | null;
    submittedById: string | null;
    reason: string | null;
    disputedAt: string | null;
    evidenceUrl: string | null;
  };
  home: { teamId: string | null; name: string; userId: string | null };
  away: { teamId: string | null; name: string; userId: string | null };
  isHost: boolean;
  resolvedAt: string | null;
};

export function getCompetitionChat(competitionId: string): Promise<CompetitionChatMessage[]> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/chat`);
}

export function sendCompetitionChatMessage(competitionId: string, body: string) {
  return apiRequest<{ id: string; body: string; createdAt: string }>(
    `/api/competitions/${encodeURIComponent(competitionId)}/chat`,
    { method: 'POST', body: JSON.stringify({ body }) },
  );
}

export function approveMatchResult(matchId: string, version: number) {
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export function contestMatchResult(matchId: string, input: {
  version: number;
  homeScore: number;
  awayScore: number;
  reason?: string;
  evidence: File;
}) {
  const body = new FormData();
  body.set('version', String(input.version));
  body.set('homeScore', String(input.homeScore));
  body.set('awayScore', String(input.awayScore));
  body.set('reason', input.reason ?? '');
  body.set('evidence', input.evidence);
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/dispute`, {
    method: 'POST',
    body,
  });
}

export function getMatchDispute(matchId: string): Promise<MatchDispute> {
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/dispute`);
}

export function judgeMatchDispute(matchId: string, input: {
  decision: 'HOME' | 'AWAY' | 'CANCEL';
  version: number;
  epicComeback?: boolean;
}) {
  return apiRequest<{ ok: true; canceled: boolean }>(
    `/api/matches/${encodeURIComponent(matchId)}/dispute/judge`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}
