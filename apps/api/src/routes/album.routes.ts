import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';

export const album = new Hono<Env>();

const openPackSchema = z.object({
  packType: z.enum(['COMMON', 'PREMIUM']).default('COMMON'),
});

type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
type PageRow = { albumPage: string; total: number; firstNumber: number };
type ProgressRow = { completed: number };

const PACK_SIZE = 5;
const RARITIES: readonly Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

function randomUnit(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] / 0x1_0000_0000;
}

/** Product odds per independent card slot: 80% / 15% / 4% / 1%. */
function rollRarity(): Rarity {
  const roll = randomUnit();
  if (roll < 0.80) return 'COMMON';
  if (roll < 0.95) return 'RARE';
  if (roll < 0.99) return 'EPIC';
  return 'LEGENDARY';
}

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(randomUnit() * items.length)];
}

album.get('/', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const requestedPage = c.req.query('page')?.trim();

  // SQLite/D1 does not support PostgreSQL's ::int / ::uuid syntax.
  // Prefer Prisma's provider-neutral grouping over raw dialect SQL.
  const pages: PageRow[] = c.env.DB
    ? (await db.chaveaCard.groupBy({
        by: ['albumPage'],
        where: { isActive: true },
        _count: { _all: true },
        _min: { cardNumber: true },
      })).map(row => ({
        albumPage: row.albumPage,
        total: row._count._all,
        firstNumber: row._min.cardNumber ?? 0,
      })).sort((a,b) => a.firstNumber - b.firstNumber || a.albumPage.localeCompare(b.albumPage))
    : await db.$queryRaw<PageRow[]>(Prisma.sql`
        SELECT "albumPage", COUNT(*)::int AS "total", MIN("cardNumber")::int AS "firstNumber"
        FROM "ChaveaCard" WHERE "isActive" = true
        GROUP BY "albumPage" ORDER BY MIN("cardNumber") ASC, "albumPage" ASC
      `);

  const selectedPage = requestedPage && pages.some((page) => page.albumPage === requestedPage)
    ? requestedPage
    : pages[0]?.albumPage ?? null;

  const [total, progressRows, packs, cards] = await Promise.all([
    db.chaveaCard.count({ where: { isActive: true } }),
    c.env.DB
      ? db.userInventoryCard.groupBy({
          by: ['cardId'],
          where: { userId: user.id, card: { isActive: true } },
        }).then(rows => [{ completed: rows.length }])
      : db.$queryRaw<ProgressRow[]>(Prisma.sql`
          SELECT COUNT(DISTINCT i."cardId")::int AS "completed"
          FROM "UserInventoryCard" i
          INNER JOIN "ChaveaCard" c ON c."id" = i."cardId" AND c."isActive" = true
          WHERE i."userId" = ${user.id}::uuid
        `),
    db.userStickerPack.findMany({
      where: { userId: user.id },
      orderBy: { packType: 'asc' },
      select: { packType: true, quantity: true },
    }),
    selectedPage
      ? db.chaveaCard.findMany({
          where: { isActive: true, albumPage: selectedPage },
          orderBy: { cardNumber: 'asc' },
          select: {
            id: true,
            cardNumber: true,
            name: true,
            rarity: true,
            imageUrl: true,
            boostType: true,
            boostValue: true,
            albumPage: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const cardIds = cards.map((card) => card.id);
  const copies = cardIds.length
    ? await db.userInventoryCard.groupBy({
        by: ['cardId'],
        where: { userId: user.id, cardId: { in: cardIds } },
        _count: { _all: true },
      })
    : [];
  const copyCountByCard = new Map(copies.map((entry) => [entry.cardId, entry._count._all]));
  const completed = progressRows[0]?.completed ?? 0;

  return c.json({
    pages,
    selectedPage,
    progress: {
      completed,
      total,
      percentage: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
    },
    packs,
    cards: cards.map((card) => ({ ...card, copyCount: copyCountByCard.get(card.id) ?? 0 })),
  });
});

album.post('/open-pack', async (c) => {
  const parsed = openPackSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'INVALID_PACK_TYPE' }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const packType = parsed.data.packType;

  if (c.env.DB) {
    const catalog = await db.chaveaCard.findMany({
      where:{isActive:true},
      select:{ id:true,cardNumber:true,name:true,rarity:true,imageUrl:true,albumPage:true },
      take:1000,
    });
    const pools = new Map<Rarity, typeof catalog>();
    for(const rarity of RARITIES)pools.set(rarity,[]);
    for(const card of catalog)pools.get(card.rarity as Rarity)?.push(card);
    if(RARITIES.some(rarity=>(pools.get(rarity)?.length??0)===0)){
      return c.json({
        error:'CARD_POOL_INCOMPLETE',
        message:'O catálogo precisa ter ao menos uma carta ativa de cada raridade.',
      },409);
    }
    const current = await db.userStickerPack.findUnique({
      where:{userId_packType:{userId:user.id,packType}},select:{quantity:true},
    });
    if(!current||current.quantity<1){
      return c.json({error:'NO_STICKER_PACKS',
        message:'Você não possui pacotinhos deste tipo.'},409);
    }
    const pulled=Array.from({length:PACK_SIZE},()=>pickOne(pools.get(rollRarity())!));
    const marker=new Date().toISOString();
    // One D1 atomic batch: spend one credit, then mint exactly five cards.
    // Each INSERT is gated by the successfully claimed updatedAt marker.
    const statements=[
      c.env.DB.prepare(`
        UPDATE "UserStickerPack"
        SET "quantity"="quantity"-1,"updatedAt"=?1
        WHERE "userId"=?2 AND "packType"=?3 AND "quantity">0
      `).bind(marker,user.id,packType),
      ...pulled.map(card=>c.env.DB!.prepare(`
        INSERT INTO "UserInventoryCard"
          ("id","userId","cardId","isEquipped","acquiredAt")
        SELECT ?1,?2,?3,0,?4 FROM "UserStickerPack" s
        WHERE s."userId"=?2 AND s."packType"=?5
          AND s."updatedAt"=?4
      `).bind(crypto.randomUUID(),user.id,card.id,marker,packType)),
    ];
    const batch = await c.env.DB.batch(statements) as Array<{meta?:{changes?:number}}>;
    if(batch[0]?.meta?.changes!==1){
      return c.json({error:'NO_STICKER_PACKS'},409);
    }
    const remaining=await db.userStickerPack.findUnique({
      where:{userId_packType:{userId:user.id,packType}},select:{quantity:true},
    });
    return c.json({
      packType,cards:pulled,remaining:remaining?.quantity??0,
      odds:{COMMON:80,RARE:15,EPIC:4,LEGENDARY:1},
    });
  }

  const result = await db.$transaction(async (tx) => {
    // One bounded catalog read (1,000 cards is intentionally supported) keeps the
    // five draws in-memory and avoids five ORDER BY random() scans or N+1 queries.
    const catalog = await tx.chaveaCard.findMany({
      where: { isActive: true },
      select: {
        id: true,
        cardNumber: true,
        name: true,
        rarity: true,
        imageUrl: true,
        albumPage: true,
      },
    });

    const pools = new Map<Rarity, typeof catalog>();
    for (const rarity of RARITIES) pools.set(rarity, []);
    for (const card of catalog) pools.get(card.rarity as Rarity)?.push(card);
    if (RARITIES.some((rarity) => (pools.get(rarity)?.length ?? 0) === 0)) {
      return { error: 'CARD_POOL_INCOMPLETE' as const };
    }

    // Atomic decrement: concurrent openings cannot consume the same last pack.
    const spent = await tx.userStickerPack.updateMany({
      where: { userId: user.id, packType, quantity: { gt: 0 } },
      data: { quantity: { decrement: 1 } },
    });
    if (spent.count !== 1) return { error: 'NO_STICKER_PACKS' as const };

    const pulled = Array.from({ length: PACK_SIZE }, () => {
      const rarity = rollRarity();
      return pickOne(pools.get(rarity)!);
    });

    await tx.userInventoryCard.createMany({
      data: pulled.map((card) => ({
        id: crypto.randomUUID(),
        userId: user.id,
        cardId: card.id,
        isEquipped: false,
      })),
    });

    const remaining = await tx.userStickerPack.findUnique({
      where: { userId_packType: { userId: user.id, packType } },
      select: { quantity: true },
    });

    return {
      cards: pulled,
      remaining: remaining?.quantity ?? 0,
    };
  }, { maxWait: 5_000, timeout: 10_000 });

  if ('error' in result) {
    if (result.error === 'NO_STICKER_PACKS') {
      return c.json({ error: result.error, message: 'Você não possui pacotinhos deste tipo.' }, 409);
    }
    return c.json({
      error: result.error,
      message: 'O catálogo precisa ter ao menos uma carta ativa de cada raridade antes de abrir pacotes.',
    }, 409);
  }

  return c.json({
    packType,
    cards: result.cards,
    remaining: result.remaining,
    odds: { COMMON: 80, RARE: 15, EPIC: 4, LEGENDARY: 1 },
  });
});
