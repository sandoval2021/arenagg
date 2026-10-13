import type { BadgeCode } from '../domain/achievements/badges';
import type { D1DatabasePort } from './native-auth.routes';

/**
 * Atomic, repeat-safe Cloudflare D1 badge reward.
 * One pack is credited only when a NEW badge id was inserted in the same
 * SQLite batch. Duplicate events never generate duplicate packs.
 */
export async function grantBadgesD1(
  db:D1DatabasePort,userId:string,codes:readonly BadgeCode[],
):Promise<number>{
  const unique=[...new Set(codes)];
  if(!unique.length)return 0;
  const now=new Date().toISOString();
  const statements=[];
  for(const code of unique){
    const id=crypto.randomUUID();
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO "UserBadge" ("id","userId","badgeCode","awardedAt")
      VALUES (?1,?2,?3,?4)
    `).bind(id,userId,code,now));
    statements.push(db.prepare(`
      INSERT INTO "UserStickerPack"
        ("id","userId","packType","quantity","createdAt","updatedAt")
      SELECT ?1,?2,'COMMON',1,?3,?3
      FROM "UserBadge" WHERE "id"=?4
      ON CONFLICT ("userId","packType")
      DO UPDATE SET "quantity"="quantity"+1,"updatedAt"=excluded."updatedAt"
    `).bind(crypto.randomUUID(),userId,now,id));
  }
  const response=await db.batch(statements) as Array<{meta?:{changes?:number}}>;
  return response.reduce((total,row,index)=>index%2===0
    ? total+(row.meta?.changes??0):total,0);
}
