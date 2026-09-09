export const RANK_TIERS = [
  { code: 'BRONZE', label: 'Bronze', subtitle: 'Iniciante', minMmr: 0 },
  { code: 'SILVER', label: 'Prata', subtitle: 'Competidor', minMmr: 1550 },
  { code: 'GOLD', label: 'Ouro', subtitle: 'Destaque', minMmr: 1650 },
  { code: 'PLATINUM', label: 'Platina', subtitle: 'Elite', minMmr: 1750 },
  { code: 'DIAMOND', label: 'Diamante', subtitle: 'Especialista', minMmr: 1850 },
  { code: 'LEGEND', label: 'Lenda', subtitle: 'Lendário', minMmr: 2000 },
  { code: 'CHAVEA_PRO', label: 'Chavea Pro', subtitle: 'Topo da Arena', minMmr: 2200 },
] as const;

export type RankCode = (typeof RANK_TIERS)[number]['code'];
export type RankTier = (typeof RANK_TIERS)[number];

export function resolveRank(mmr: number): RankTier {
  let current: RankTier = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (mmr >= tier.minMmr) current = tier;
    else break;
  }
  return current;
}
