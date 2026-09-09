export const BADGE_CODES = {
  FIRST_MATCH: 'FIRST_MATCH',
  FIRST_GOAL: 'FIRST_GOAL',
  CREATE_TEAM: 'CREATE_TEAM',
  ADD_FRIEND: 'ADD_FRIEND',
  FIRST_WIN: 'FIRST_WIN',
  FIRST_DRAW: 'FIRST_DRAW',
  FIRST_CLEAN_SHEET: 'FIRST_CLEAN_SHEET',
  FIRST_CLIP: 'FIRST_CLIP',
  FIRST_HOST: 'FIRST_HOST',
  FIRST_CHECKIN: 'FIRST_CHECKIN',
  HAT_TRICK: 'HAT_TRICK',
  RELENTLESS_SCORER: 'RELENTLESS_SCORER',
  GOAL_STORM_7: 'GOAL_STORM_7',
  DOUBLE_DIGITS_10: 'DOUBLE_DIGITS_10',
  WALL: 'WALL',
  SHUTOUT_3: 'SHUTOUT_3',
  NARROW_ESCAPE: 'NARROW_ESCAPE',
  PENALTY_KING: 'PENALTY_KING',
  EPIC_COMEBACK: 'EPIC_COMEBACK',
  GIANT_KILLER: 'GIANT_KILLER',
  WINS_3: 'WINS_3',
  WINS_5: 'WINS_5',
  WINS_10: 'WINS_10',
  WINS_25: 'WINS_25',
  WINS_50: 'WINS_50',
  WINS_100: 'WINS_100',
  GOALS_10: 'GOALS_10',
  GOALS_25: 'GOALS_25',
  GOALS_50: 'GOALS_50',
  GOALS_100: 'GOALS_100',
  GOALS_250: 'GOALS_250',
  GOALS_500: 'GOALS_500',
  MATCHES_5: 'MATCHES_5',
  MATCHES_10: 'MATCHES_10',
  MATCHES_25: 'MATCHES_25',
  MATCHES_50: 'MATCHES_50',
  MATCHES_100: 'MATCHES_100',
  WIN_STREAK_3: 'WIN_STREAK_3',
  WIN_STREAK_5: 'WIN_STREAK_5',
  WIN_STREAK_10: 'WIN_STREAK_10',
  CHAMPION_FIRST: 'CHAMPION_FIRST',
  CHAMPION_3: 'CHAMPION_3',
  CHAMPION_5: 'CHAMPION_5',
  MMR_1600: 'MMR_1600',
  MMR_1800: 'MMR_1800',
  MMR_2000: 'MMR_2000',
  VETERAN_30D: 'VETERAN_30D',
  LOYAL_90D: 'LOYAL_90D',
  HOST_ELITE_5: 'HOST_ELITE_5',
  SOCIAL_STAR_10: 'SOCIAL_STAR_10',
} as const;

export type BadgeCode = (typeof BADGE_CODES)[keyof typeof BADGE_CODES];
export type BadgeCategory = 'EASY' | 'MEDIUM' | 'HARD' | 'LOYALTY';
export type BadgeRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type BadgeDefinition = {
  code: BadgeCode;
  title: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
};

export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  { code: BADGE_CODES.FIRST_MATCH, title: 'O Início', description: 'Finalize sua primeira partida.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.FIRST_GOAL, title: 'Primeiro Gol', description: 'Marque seu primeiro gol no Chavea.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.CREATE_TEAM, title: 'Crie seu Time', description: 'Tenha seu primeiro time em uma Copa.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.ADD_FRIEND, title: 'Adicione um Amigo', description: 'Faça sua primeira amizade no Chavea.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.FIRST_WIN, title: 'Primeira Vitória', description: 'Vença sua primeira partida.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.FIRST_DRAW, title: 'Ponto Suado', description: 'Conquiste seu primeiro empate.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.FIRST_CLEAN_SHEET, title: 'Primeiro Zero', description: 'Termine uma partida sem sofrer gols.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.FIRST_CLIP, title: 'Primeiro Highlight', description: 'Publique seu primeiro clipe de partida.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.FIRST_HOST, title: 'Minha Primeira Copa', description: 'Organize sua primeira competição.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.FIRST_CHECKIN, title: 'Pronto pra Batalha', description: 'Faça seu primeiro check-in em uma partida.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.HAT_TRICK, title: 'Hat-Trick', description: 'Marque 3 ou mais gols em uma partida.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.RELENTLESS_SCORER, title: 'Goleador Implacável', description: 'Marque 5 ou mais gols em uma partida.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.GOAL_STORM_7, title: 'Chuva de Gols', description: 'Marque 7 ou mais gols em uma partida.', category: 'HARD', rarity: 'EPIC' },
  { code: BADGE_CODES.DOUBLE_DIGITS_10, title: 'Dois Dígitos', description: 'Marque 10 ou mais gols em uma partida.', category: 'HARD', rarity: 'LEGENDARY' },
  { code: BADGE_CODES.WALL, title: 'Muralha', description: 'Vença sem sofrer nenhum gol.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.SHUTOUT_3, title: 'Trator Defensivo', description: 'Vença por 3 ou mais gols sem sofrer.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.NARROW_ESCAPE, title: 'No Sufoco', description: 'Vença uma partida por exatamente 1 gol.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.PENALTY_KING, title: 'Rei dos Pênaltis', description: 'Vença uma disputa por pênaltis.', category: 'MEDIUM', rarity: 'EPIC' },
  { code: BADGE_CODES.EPIC_COMEBACK, title: 'Virada Épica', description: 'Vença após estar perdendo, com confirmação do Host.', category: 'HARD', rarity: 'LEGENDARY' },
  { code: BADGE_CODES.GIANT_KILLER, title: 'Davi contra Golias', description: 'Vença alguém com pelo menos 200 MMR a mais.', category: 'HARD', rarity: 'EPIC' },
  { code: BADGE_CODES.WINS_3, title: 'Pegando Ritmo', description: 'Some 3 vitórias.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.WINS_5, title: 'Mão Cheia', description: 'Some 5 vitórias.', category: 'MEDIUM', rarity: 'COMMON' },
  { code: BADGE_CODES.WINS_10, title: 'Dez na Conta', description: 'Some 10 vitórias.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.WINS_25, title: 'Competidor de Elite', description: 'Some 25 vitórias.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.WINS_50, title: 'Imparável', description: 'Some 50 vitórias.', category: 'HARD', rarity: 'EPIC' },
  { code: BADGE_CODES.WINS_100, title: 'Platina', description: 'Alcance 100 vitórias.', category: 'HARD', rarity: 'LEGENDARY' },
  { code: BADGE_CODES.GOALS_10, title: 'Artilheiro em Formação', description: 'Marque 10 gols na conta.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.GOALS_25, title: 'Mira Calibrada', description: 'Marque 25 gols na conta.', category: 'MEDIUM', rarity: 'COMMON' },
  { code: BADGE_CODES.GOALS_50, title: 'Camisa 9', description: 'Marque 50 gols na conta.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.GOALS_100, title: 'Centenário de Gols', description: 'Marque 100 gols na conta.', category: 'HARD', rarity: 'RARE' },
  { code: BADGE_CODES.GOALS_250, title: 'Canhão Chavea', description: 'Marque 250 gols na conta.', category: 'HARD', rarity: 'EPIC' },
  { code: BADGE_CODES.GOALS_500, title: 'Máquina de Fazer Gols', description: 'Marque 500 gols na conta.', category: 'HARD', rarity: 'LEGENDARY' },
  { code: BADGE_CODES.MATCHES_5, title: 'Cinco Batalhas', description: 'Finalize 5 partidas.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.MATCHES_10, title: 'Rodagem', description: 'Finalize 10 partidas.', category: 'EASY', rarity: 'COMMON' },
  { code: BADGE_CODES.MATCHES_25, title: 'Casca Grossa', description: 'Finalize 25 partidas.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.MATCHES_50, title: 'Veterano de Arena', description: 'Finalize 50 partidas.', category: 'HARD', rarity: 'EPIC' },
  { code: BADGE_CODES.MATCHES_100, title: 'Lenda das 100 Partidas', description: 'Finalize 100 partidas.', category: 'HARD', rarity: 'LEGENDARY' },
  { code: BADGE_CODES.WIN_STREAK_3, title: 'Série Invicta', description: 'Vença 3 partidas seguidas.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.WIN_STREAK_5, title: 'Em Chamas', description: 'Vença 5 partidas seguidas.', category: 'HARD', rarity: 'EPIC' },
  { code: BADGE_CODES.WIN_STREAK_10, title: 'Intocável', description: 'Vença 10 partidas seguidas.', category: 'HARD', rarity: 'LEGENDARY' },
  { code: BADGE_CODES.CHAMPION_FIRST, title: 'Campeão', description: 'Conquiste seu primeiro título.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.CHAMPION_3, title: 'Tricampeão', description: 'Conquiste 3 títulos.', category: 'HARD', rarity: 'EPIC' },
  { code: BADGE_CODES.CHAMPION_5, title: 'Dinastia', description: 'Conquiste 5 títulos.', category: 'HARD', rarity: 'LEGENDARY' },
  { code: BADGE_CODES.MMR_1600, title: 'Subindo de Patente', description: 'Alcance 1600 MMR.', category: 'MEDIUM', rarity: 'RARE' },
  { code: BADGE_CODES.MMR_1800, title: 'Diamante Competitivo', description: 'Alcance 1800 MMR.', category: 'HARD', rarity: 'EPIC' },
  { code: BADGE_CODES.MMR_2000, title: 'Lenda do MMR', description: 'Alcance 2000 MMR.', category: 'HARD', rarity: 'LEGENDARY' },
  { code: BADGE_CODES.VETERAN_30D, title: 'Veterano', description: 'Mantenha sua conta por mais de 1 mês.', category: 'LOYALTY', rarity: 'RARE' },
  { code: BADGE_CODES.LOYAL_90D, title: 'Fiel ao Chavea', description: 'Complete 90 dias de conta.', category: 'LOYALTY', rarity: 'EPIC' },
  { code: BADGE_CODES.HOST_ELITE_5, title: 'Host de Elite', description: 'Organize 5 Copas.', category: 'LOYALTY', rarity: 'EPIC' },
  { code: BADGE_CODES.SOCIAL_STAR_10, title: 'Craque da Resenha', description: 'Tenha 10 amizades aceitas.', category: 'LOYALTY', rarity: 'EPIC' },
] as const;

if (BADGE_CATALOG.length !== 50) {
  throw new Error(`BADGE_CATALOG must contain exactly 50 achievements, got ${BADGE_CATALOG.length}`);
}

export function profileProgressBadges(profile: {
  mmr: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  totalGoalsScored: number;
  championshipsWon: number;
}): BadgeCode[] {
  const result: BadgeCode[] = [];
  const matches = profile.totalWins + profile.totalDraws + profile.totalLosses;

  if (matches >= 1) result.push(BADGE_CODES.FIRST_MATCH);
  if (profile.totalGoalsScored >= 1) result.push(BADGE_CODES.FIRST_GOAL);
  if (profile.totalWins >= 1) result.push(BADGE_CODES.FIRST_WIN);
  if (profile.totalDraws >= 1) result.push(BADGE_CODES.FIRST_DRAW);

  for (const [threshold, code] of [[3, BADGE_CODES.WINS_3], [5, BADGE_CODES.WINS_5], [10, BADGE_CODES.WINS_10], [25, BADGE_CODES.WINS_25], [50, BADGE_CODES.WINS_50], [100, BADGE_CODES.WINS_100]] as const) {
    if (profile.totalWins >= threshold) result.push(code);
  }
  for (const [threshold, code] of [[10, BADGE_CODES.GOALS_10], [25, BADGE_CODES.GOALS_25], [50, BADGE_CODES.GOALS_50], [100, BADGE_CODES.GOALS_100], [250, BADGE_CODES.GOALS_250], [500, BADGE_CODES.GOALS_500]] as const) {
    if (profile.totalGoalsScored >= threshold) result.push(code);
  }
  for (const [threshold, code] of [[5, BADGE_CODES.MATCHES_5], [10, BADGE_CODES.MATCHES_10], [25, BADGE_CODES.MATCHES_25], [50, BADGE_CODES.MATCHES_50], [100, BADGE_CODES.MATCHES_100]] as const) {
    if (matches >= threshold) result.push(code);
  }
  if (profile.championshipsWon >= 1) result.push(BADGE_CODES.CHAMPION_FIRST);
  if (profile.championshipsWon >= 3) result.push(BADGE_CODES.CHAMPION_3);
  if (profile.championshipsWon >= 5) result.push(BADGE_CODES.CHAMPION_5);
  if (profile.mmr >= 1600) result.push(BADGE_CODES.MMR_1600);
  if (profile.mmr >= 1800) result.push(BADGE_CODES.MMR_1800);
  if (profile.mmr >= 2000) result.push(BADGE_CODES.MMR_2000);
  return result;
}

export function matchEventBadges(input: {
  goalsScored: number;
  goalsConceded: number;
  won: boolean;
  draw: boolean;
  wonOnPenalties: boolean;
  opponentPreMmr: number;
  playerPreMmr: number;
  epicComeback: boolean;
}): BadgeCode[] {
  const result: BadgeCode[] = [];
  const margin = input.goalsScored - input.goalsConceded;
  if (input.goalsScored >= 1) result.push(BADGE_CODES.FIRST_GOAL);
  if (input.goalsConceded === 0) result.push(BADGE_CODES.FIRST_CLEAN_SHEET);
  if (input.goalsScored >= 3) result.push(BADGE_CODES.HAT_TRICK);
  if (input.goalsScored >= 5) result.push(BADGE_CODES.RELENTLESS_SCORER);
  if (input.goalsScored >= 7) result.push(BADGE_CODES.GOAL_STORM_7);
  if (input.goalsScored >= 10) result.push(BADGE_CODES.DOUBLE_DIGITS_10);
  if (input.won && input.goalsConceded === 0) result.push(BADGE_CODES.WALL);
  if (input.won && input.goalsConceded === 0 && margin >= 3) result.push(BADGE_CODES.SHUTOUT_3);
  if (input.won && margin === 1) result.push(BADGE_CODES.NARROW_ESCAPE);
  if (input.wonOnPenalties) result.push(BADGE_CODES.PENALTY_KING);
  if (input.epicComeback && input.won) result.push(BADGE_CODES.EPIC_COMEBACK);
  if (input.won && input.opponentPreMmr - input.playerPreMmr >= 200) result.push(BADGE_CODES.GIANT_KILLER);
  return result;
}

export function streakBadges(winStreak: number): BadgeCode[] {
  const result: BadgeCode[] = [];
  if (winStreak >= 3) result.push(BADGE_CODES.WIN_STREAK_3);
  if (winStreak >= 5) result.push(BADGE_CODES.WIN_STREAK_5);
  if (winStreak >= 10) result.push(BADGE_CODES.WIN_STREAK_10);
  return result;
}

export function loyaltyBadges(createdAt: Date, now = new Date()): BadgeCode[] {
  const ageDays = Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000);
  const result: BadgeCode[] = [];
  if (ageDays >= 30) result.push(BADGE_CODES.VETERAN_30D);
  if (ageDays >= 90) result.push(BADGE_CODES.LOYAL_90D);
  return result;
}
