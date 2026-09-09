import type { Prisma, PrismaClient } from '@prisma/client';
import {
  BADGE_CODES,
  loyaltyBadges,
  matchEventBadges,
  profileProgressBadges,
  streakBadges,
  type BadgeCode,
} from '../domain/achievements/badges';

type Tx = Prisma.TransactionClient;

type MatchAchievementInput = {
  matchId: string;
  homeUserId: string;
  awayUserId: string;
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  homeWon: boolean;
  awayWon: boolean;
  draw: boolean;
  homePreMmr: number;
  awayPreMmr: number;
};

function uniqueCodes(codes: readonly BadgeCode[]): BadgeCode[] {
  return [...new Set(codes)];
}

export async function awardBadgeCodes(
  db: Pick<PrismaClient, 'userBadge'> | Pick<Tx, 'userBadge'>,
  userId: string,
  codes: readonly BadgeCode[],
): Promise<void> {
  const unique = uniqueCodes(codes);
  if (unique.length === 0) return;
  await db.userBadge.createMany({
    data: unique.map((badgeCode) => ({ userId, badgeCode })),
    skipDuplicates: true,
  });
}

/**
 * Hot path: independent of catalog size. It reads both updated profiles once,
 * reads at most the last 10 matches per player for streaks, then writes every
 * newly-qualified badge in one createMany. Complexity is O(P * S + B), where
 * P=2 players, S<=10 recent matches and B<=50 catalog entries.
 */
export async function evaluateMatchAchievementBatch(
  tx: Tx,
  input: MatchAchievementInput,
): Promise<void> {
  const userIds = [input.homeUserId, input.awayUserId];
  const users = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      createdAt: true,
      profile: {
        select: {
          mmr: true,
          totalWins: true,
          totalDraws: true,
          totalLosses: true,
          totalGoalsScored: true,
          championshipsWon: true,
        },
      },
    },
  });

  const streakPairs = await Promise.all(
    userIds.map(async (userId) => [userId, await currentWinStreak(tx, userId)] as const),
  );
  const streakByUser = new Map(streakPairs);
  const grants: Array<{ userId: string; badgeCode: BadgeCode }> = [];

  for (const user of users) {
    if (!user.profile) continue;
    const isHome = user.id === input.homeUserId;
    const won = isHome ? input.homeWon : input.awayWon;
    const goalsScored = isHome ? input.homeScore : input.awayScore;
    const goalsConceded = isHome ? input.awayScore : input.homeScore;
    const playerPreMmr = isHome ? input.homePreMmr : input.awayPreMmr;
    const opponentPreMmr = isHome ? input.awayPreMmr : input.homePreMmr;
    const wonOnPenalties = won
      && input.homeScore === input.awayScore
      && input.homePenaltyScore != null
      && input.awayPenaltyScore != null;

    const codes = uniqueCodes([
      ...profileProgressBadges(user.profile),
      ...loyaltyBadges(user.createdAt),
      ...streakBadges(streakByUser.get(user.id) ?? 0),
      ...matchEventBadges({
        goalsScored,
        goalsConceded,
        won,
        draw: input.draw,
        wonOnPenalties,
        playerPreMmr,
        opponentPreMmr,
        epicComeback: false,
      }),
    ]);
    for (const badgeCode of codes) grants.push({ userId: user.id, badgeCode });
  }

  if (grants.length > 0) {
    await tx.userBadge.createMany({ data: grants, skipDuplicates: true });
  }
}

async function currentWinStreak(tx: Tx, userId: string): Promise<number> {
  const matches = await tx.match.findMany({
    where: {
      status: 'FINISHED',
      profileAppliedAt: { not: null },
      OR: [
        { homeTeam: { participation: { userId } } },
        { awayTeam: { participation: { userId } } },
      ],
    },
    orderBy: { profileAppliedAt: 'desc' },
    take: 10,
    select: {
      homeScore: true,
      awayScore: true,
      homePenaltyScore: true,
      awayPenaltyScore: true,
      homeTeam: { select: { participation: { select: { userId: true } } } },
      awayTeam: { select: { participation: { select: { userId: true } } } },
    },
  });

  let streak = 0;
  for (const match of matches) {
    if (match.homeScore == null || match.awayScore == null) break;
    const isHome = match.homeTeam?.participation.userId === userId;
    const tied = match.homeScore === match.awayScore;
    const homePenaltyWin = tied
      && match.homePenaltyScore != null
      && match.awayPenaltyScore != null
      && match.homePenaltyScore > match.awayPenaltyScore;
    const awayPenaltyWin = tied
      && match.homePenaltyScore != null
      && match.awayPenaltyScore != null
      && match.awayPenaltyScore > match.homePenaltyScore;
    const homeWon = match.homeScore > match.awayScore || homePenaltyWin;
    const awayWon = match.awayScore > match.homeScore || awayPenaltyWin;
    if ((isHome && homeWon) || (!isHome && awayWon)) streak += 1;
    else break;
  }
  return streak;
}

export async function awardTeamCreatedBadge(db: PrismaClient, userId: string): Promise<void> {
  await awardBadgeCodes(db, userId, [BADGE_CODES.CREATE_TEAM]);
}

export async function awardCheckinBadge(db: PrismaClient, userId: string): Promise<void> {
  await awardBadgeCodes(db, userId, [BADGE_CODES.FIRST_CHECKIN]);
}

export async function awardClipBadge(db: PrismaClient, userId: string): Promise<void> {
  await awardBadgeCodes(db, userId, [BADGE_CODES.FIRST_CLIP]);
}

export async function awardEpicComebackBadge(db: PrismaClient, userId: string): Promise<void> {
  await awardBadgeCodes(db, userId, [BADGE_CODES.EPIC_COMEBACK]);
}

export async function evaluateHostAchievements(db: PrismaClient, userId: string): Promise<void> {
  const count = await db.competition.count({ where: { hostId: userId } });
  const codes: BadgeCode[] = [];
  if (count >= 1) codes.push(BADGE_CODES.FIRST_HOST);
  if (count >= 5) codes.push(BADGE_CODES.HOST_ELITE_5);
  await awardBadgeCodes(db, userId, codes);
}

export async function evaluateFriendAchievements(db: PrismaClient, userId: string): Promise<void> {
  const count = await db.friendship.count({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
  });
  const codes: BadgeCode[] = [];
  if (count >= 1) codes.push(BADGE_CODES.ADD_FRIEND);
  if (count >= 10) codes.push(BADGE_CODES.SOCIAL_STAR_10);
  await awardBadgeCodes(db, userId, codes);
}

export async function evaluateLoyaltyAchievements(db: PrismaClient, userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (user) await awardBadgeCodes(db, userId, loyaltyBadges(user.createdAt));
}
