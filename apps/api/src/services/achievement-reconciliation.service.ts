import type { PrismaClient } from '@prisma/client';
import { BADGE_CODES, loyaltyBadges, type BadgeCode } from '../domain/achievements/badges';
import { awardBadgeCodes } from './achievement-engine.service';

/**
 * Reconciliação eventual para eventos raros que podem ter ocorrido antes da
 * Fase 5. São cinco leituras indexadas/contagens independentes e um único lote
 * de badges; nenhuma partida histórica é carregada aqui.
 */
export async function reconcileRareAchievements(db: PrismaClient, userId: string): Promise<void> {
  const [user, hosted, friends, teams, clips] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    db.competition.count({ where: { hostId: userId } }),
    db.friendship.count({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    }),
    db.team.count({ where: { createdById: userId } }),
    db.matchMedia.count({ where: { createdById: userId } }),
  ]);

  const codes: BadgeCode[] = [];
  if (user) codes.push(...loyaltyBadges(user.createdAt));
  if (hosted >= 1) codes.push(BADGE_CODES.FIRST_HOST);
  if (hosted >= 5) codes.push(BADGE_CODES.HOST_ELITE_5);
  if (friends >= 1) codes.push(BADGE_CODES.ADD_FRIEND);
  if (friends >= 10) codes.push(BADGE_CODES.SOCIAL_STAR_10);
  if (teams >= 1) codes.push(BADGE_CODES.CREATE_TEAM);
  if (clips >= 1) codes.push(BADGE_CODES.FIRST_CLIP);
  await awardBadgeCodes(db, userId, codes);
}
