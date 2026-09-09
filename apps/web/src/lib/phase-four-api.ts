import { apiRequest } from './api';

export type CompetitionClip = {
  id: string;
  url: string;
  platform: 'YOUTUBE' | 'TWITCH' | 'TIKTOK' | 'LINK' | string;
  createdAt: string;
  createdById: string;
  match: {
    id: string;
    homeScore: number | null;
    awayScore: number | null;
    round: { number: number; name: string | null } | null;
    homeTeam: { id: string; name: string; logoUrl: string | null } | null;
    awayTeam: { id: string; name: string; logoUrl: string | null } | null;
  };
};

export function getCompetitionClips(competitionId: string): Promise<CompetitionClip[]> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/clips`);
}

export function addMatchClip(matchId: string, url: string): Promise<CompetitionClip> {
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/clips`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}
