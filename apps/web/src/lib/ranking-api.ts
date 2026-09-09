import { apiRequest } from './api';
import type { ConsoleTag } from './social-api';

export type RankingEntry = {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  consoles: ConsoleTag[];
  mmr: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  championshipsWon: number;
  isCurrentUser: boolean;
  crest: {
    name: string;
    logoUrl: string | null;
  } | null;
};

export function getGlobalRanking(): Promise<{ entries: RankingEntry[] }> {
  return apiRequest('/api/ranking');
}
