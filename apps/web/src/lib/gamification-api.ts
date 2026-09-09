import { apiRequest } from './api';

export type RankCode = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'LEGEND' | 'CHAVEA_PRO';

export type PlayerRank = {
  userId: string;
  mmr: number;
  rank: {
    code: RankCode;
    label: string;
    subtitle: string;
    minMmr: number;
  };
};

export function getPlayerRanks(userIds: string[]): Promise<PlayerRank[]> {
  const unique = [...new Set(userIds)].slice(0, 50);
  if (unique.length === 0) return Promise.resolve([]);
  return apiRequest('/api/gamification/ranks', {
    method: 'POST',
    body: JSON.stringify({ userIds: unique }),
  });
}

export function refreshMyAchievements(): Promise<{ ok: true }> {
  return apiRequest('/api/gamification/refresh', { method: 'POST' });
}

export function resolveRankLocally(mmr: number): PlayerRank['rank'] {
  const tiers: PlayerRank['rank'][] = [
    { code: 'BRONZE', label: 'Bronze', subtitle: 'Iniciante', minMmr: 0 },
    { code: 'SILVER', label: 'Prata', subtitle: 'Competidor', minMmr: 1550 },
    { code: 'GOLD', label: 'Ouro', subtitle: 'Destaque', minMmr: 1650 },
    { code: 'PLATINUM', label: 'Platina', subtitle: 'Elite', minMmr: 1750 },
    { code: 'DIAMOND', label: 'Diamante', subtitle: 'Especialista', minMmr: 1850 },
    { code: 'LEGEND', label: 'Lenda', subtitle: 'Lendário', minMmr: 2000 },
    { code: 'CHAVEA_PRO', label: 'Chavea Pro', subtitle: 'Topo da Arena', minMmr: 2200 },
  ];
  let current = tiers[0];
  for (const tier of tiers) {
    if (mmr >= tier.minMmr) current = tier;
    else break;
  }
  return current;
}
