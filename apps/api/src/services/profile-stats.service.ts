import type { Prisma } from '@prisma/client';
import { BADGE_CODES, type BadgeCode } from '../domain/achievements/badges';
import { resolveWinner } from '../domain/bracket/knockout';
import { calculateElo, type EloOutcome } from '../domain/ranking/elo';
import { calculateStandings } from '../domain/standings/calculate';
import { awardBadgeCodes, evaluateMatchAchievementBatch } from './achievement-engine.service';
import { syncGroupStandingsForMatch } from './group-stage.service';
import { creditStickerPacks } from './sticker-pack-rewards.service';

type Tx = Prisma.TransactionClient;

type ProfileDelta = {
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  totalGoalsScored: number;
  totalGoalsConceded: number;
  mmrDelta: number;
};

async function lockCompetition(tx: Tx, competitionId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${competitionId}))`;
}

async function lockPlayerProfiles(tx: Tx, userIds: string[]): Promise<void> {
  const orderedIds = [...new Set(userIds)].sort();
  for (const userId of orderedIds) {
    const lockKey = `profile:${userId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }
}

async function ensureProfile(tx: Tx, userId: string): Promise<{ mmr: number }> {
  return tx.userProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { mmr: true },
  });
}

async function incrementProfile(tx: Tx, userId: string, delta: ProfileDelta): Promise<void> {
  await tx.userProfile.update({
    where: { userId },
    data: {
      totalWins: { increment: delta.totalWins },
      totalDraws: { increment: delta.totalDraws },
      totalLosses: { increment: delta.totalLosses },
      totalGoalsScored: { increment: delta.totalGoalsScored },
      totalGoalsConceded: { increment: delta.totalGoalsConceded },
      mmr: { increment: delta.mmrDelta },
    },
  });
}

async function awardChampionship(tx: Tx, userId: string): Promise<void> {
  const profile = await tx.userProfile.upsert({
    where: { userId },
    create: { userId, championshipsWon: 1 },
    update: { championshipsWon: { increment: 1 } },
    select: { championshipsWon: true },
  });
  const codes: BadgeCode[] = [];
  if (profile.championshipsWon >= 1) codes.push(BADGE_CODES.CHAMPION_FIRST);
  if (profile.championshipsWon >= 3) codes.push(BADGE_CODES.CHAMPION_3);
  if (profile.championshipsWon >= 5) codes.push(BADGE_CODES.CHAMPION_5);
  await awardBadgeCodes(tx, userId, codes);
}

async function maybeFinalizeCompetition(tx: Tx, competitionId: string): Promise<void> {
  await lockCompetition(tx, competitionId);

  const competition = await tx.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      type: true,
      format: true,
      status: true,
      legFormat: true,
      championshipProfileAppliedAt: true,
    },
  });

  if (
    !competition ||
    competition.championshipProfileAppliedAt ||
    !['IN_PROGRESS', 'FINISHED'].includes(competition.status) ||
    competition.type === 'ENDLESS'
  ) return;

  let championTeamId: string | null = null;

  if (competition.type === 'LEAGUE') {
    const matches = await tx.match.findMany({
      where: { competitionId },
      select: {
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });
    if (
      matches.length === 0 ||
      matches.some((match) =>
        match.status !== 'FINISHED'
        || !match.homeTeamId
        || !match.awayTeamId
        || match.homeScore == null
        || match.awayScore == null)
    ) return;

    const teams = await tx.team.findMany({ where: { competitionId }, select: { id: true } });
    championTeamId = calculateStandings(
      teams.map((team) => team.id),
      matches.map((match) => ({
        homeTeamId: match.homeTeamId!,
        awayTeamId: match.awayTeamId!,
        homeScore: match.homeScore!,
        awayScore: match.awayScore!,
      })),
    )[0]?.teamId ?? null;
  }

  if (competition.type === 'KNOCKOUT' || competition.type === 'GROUPS_KNOCKOUT') {
    // Direct two-leg knockout still requires its existing aggregate progression
    // implementation and must never crown a champion after only leg 1.
    if (competition.type === 'KNOCKOUT' && competition.legFormat !== 'SINGLE') return;

    // GROUP_STAGE only becomes eligible after its dedicated KNOCKOUT Stage exists.
    const final = await tx.match.findFirst({
      where: { competitionId, leg: 1, stage: { type: 'KNOCKOUT' } },
      orderBy: [{ stage: { order: 'desc' } }, { round: { number: 'desc' } }, { bracketPosition: 'desc' }],
      select: {
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        homePenaltyScore: true,
        awayPenaltyScore: true,
      },
    });
    if (
      !final
      || final.status !== 'FINISHED'
      || !final.homeTeamId
      || !final.awayTeamId
      || final.homeScore == null
      || final.awayScore == null
    ) return;
    try {
      championTeamId = resolveWinner({
        homeTeamId: final.homeTeamId,
        awayTeamId: final.awayTeamId,
        homeScore: final.homeScore,
        awayScore: final.awayScore,
        homePenaltyScore: final.homePenaltyScore,
        awayPenaltyScore: final.awayPenaltyScore,
      });
    } catch {
      return;
    }
  }

  if (!championTeamId) return;
  const champion = await tx.team.findUnique({
    where: { id: championTeamId },
    select: { participation: { select: { userId: true } } },
  });
  if (!champion?.participation.userId) return;

  const now = new Date();
  const claimed = await tx.competition.updateMany({
    where: {
      id: competitionId,
      championshipProfileAppliedAt: null,
      status: { in: ['IN_PROGRESS', 'FINISHED'] },
    },
    data: {
      status: 'FINISHED',
      endsAt: now,
      championshipProfileAppliedAt: now,
    },
  });
  if (claimed.count === 1) {
    await awardChampionship(tx, champion.participation.userId);
    // championshipProfileAppliedAt is the exactly-once audit/idempotency gate.
    // The champion reward commits in the same transaction as competition close.
    await creditStickerPacks(tx, champion.participation.userId, 'PREMIUM', 3);
  }
}

/**
 * Aplica uma partida finalizada ao UserProfile exatamente uma vez.
 * Ordem de locks: competição -> jogadores ordenados. O motor de conquistas
 * roda em batch depois dos contadores/MMR e não executa uma query por badge.
 */
export async function applyFinishedMatchToProfiles(tx: Tx, matchId: string): Promise<boolean> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      competitionId: true,
      status: true,
      profileAppliedAt: true,
      homeScore: true,
      awayScore: true,
      homePenaltyScore: true,
      awayPenaltyScore: true,
      homeTeam: { select: { participation: { select: { userId: true } } } },
      awayTeam: { select: { participation: { select: { userId: true } } } },
    },
  });

  if (
    !match
    || match.status !== 'FINISHED'
    || match.profileAppliedAt
    || match.homeScore == null
    || match.awayScore == null
  ) return false;

  const homeUserId = match.homeTeam?.participation.userId;
  const awayUserId = match.awayTeam?.participation.userId;
  if (!homeUserId || !awayUserId || homeUserId === awayUserId) return false;

  const claimed = await tx.match.updateMany({
    where: { id: matchId, status: 'FINISHED', profileAppliedAt: null },
    data: { profileAppliedAt: new Date() },
  });
  if (claimed.count !== 1) return false;

  await lockCompetition(tx, match.competitionId);
  await lockPlayerProfiles(tx, [homeUserId, awayUserId]);

  const homeProfile = await ensureProfile(tx, homeUserId);
  const awayProfile = await ensureProfile(tx, awayUserId);
  const tiedInRegulation = match.homeScore === match.awayScore;
  const homePenaltyWin = tiedInRegulation
    && match.homePenaltyScore != null
    && match.awayPenaltyScore != null
    && match.homePenaltyScore > match.awayPenaltyScore;
  const awayPenaltyWin = tiedInRegulation
    && match.homePenaltyScore != null
    && match.awayPenaltyScore != null
    && match.awayPenaltyScore > match.homePenaltyScore;
  const homeWon = match.homeScore > match.awayScore || homePenaltyWin;
  const awayWon = match.awayScore > match.homeScore || awayPenaltyWin;
  const draw = !homeWon && !awayWon;
  const outcome: EloOutcome = homeWon ? 'HOME_WIN' : awayWon ? 'AWAY_WIN' : 'DRAW';
  const elo = calculateElo(homeProfile.mmr, awayProfile.mmr, outcome);

  await incrementProfile(tx, homeUserId, {
    totalWins: homeWon ? 1 : 0,
    totalDraws: draw ? 1 : 0,
    totalLosses: awayWon ? 1 : 0,
    totalGoalsScored: match.homeScore,
    totalGoalsConceded: match.awayScore,
    mmrDelta: elo.homeDelta,
  });
  await incrementProfile(tx, awayUserId, {
    totalWins: awayWon ? 1 : 0,
    totalDraws: draw ? 1 : 0,
    totalLosses: homeWon ? 1 : 0,
    totalGoalsScored: match.awayScore,
    totalGoalsConceded: match.homeScore,
    mmrDelta: elo.awayDelta,
  });

  await syncGroupStandingsForMatch(tx, matchId);
  await maybeFinalizeCompetition(tx, match.competitionId);
  await evaluateMatchAchievementBatch(tx, {
    matchId,
    homeUserId,
    awayUserId,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homePenaltyScore: match.homePenaltyScore,
    awayPenaltyScore: match.awayPenaltyScore,
    homeWon,
    awayWon,
    draw,
    homePreMmr: homeProfile.mmr,
    awayPreMmr: awayProfile.mmr,
  });
  return true;
}
