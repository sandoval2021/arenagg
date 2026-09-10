import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient;
type PackDb = Pick<Tx, 'userStickerPack'>;

export type StickerPackType = 'COMMON' | 'PREMIUM';

export async function creditStickerPacks(
  db: PackDb,
  userId: string,
  packType: StickerPackType,
  quantity: number,
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) return;

  await db.userStickerPack.upsert({
    where: { userId_packType: { userId, packType } },
    create: { userId, packType, quantity },
    update: { quantity: { increment: quantity } },
  });
}

/**
 * Grants at most one COMMON pack per Sao Paulo calendar day.
 * The conditional UPDATE is the concurrency gate: simultaneous PWA bootstraps
 * cannot both claim the same daily reward. The pack credit commits atomically
 * with lastLoginReward.
 */
export async function claimDailyLoginReward(
  prisma: PrismaClient,
  userId: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const claimed = await tx.$executeRaw`
      UPDATE "UserProfile"
      SET
        "lastLoginReward" = (NOW() AT TIME ZONE 'UTC'),
        "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE "userId" = ${userId}::uuid
        AND (
          "lastLoginReward" IS NULL
          OR ("lastLoginReward" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date
             < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
        )
    `;

    if (claimed !== 1) return false;
    await creditStickerPacks(tx, userId, 'COMMON', 1);
    return true;
  }, { maxWait: 5_000, timeout: 10_000 });
}
