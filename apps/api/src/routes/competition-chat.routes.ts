import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { CHAT_SAFETY_MESSAGE, violatesChatSafetyPolicy } from '../services/chat-safety.service';

export const competitionChat = new Hono<Env>();

const messageSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

type ChatRow = {
  id: string;
  competitionId: string;
  userId: string;
  body: string;
  createdAt: Date;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  mmr: number;
};

async function canAccessCompetition(c: Context<Env>, competitionId: string) {
  const user = c.get('user');
  return c.get('prisma').competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    select: { id: true },
  });
}

competitionChat.get('/:id/chat', async (c) => {
  const competitionId = c.req.param('id');
  if (!await canAccessCompetition(c, competitionId)) {
    return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);
  }

  const db = c.get('prisma');
  if(c.env.DB){
    const messages = await db.competitionChatMessage.findMany({
      where:{competitionId},
      orderBy:{createdAt:'desc'}, take:80,
      include:{
        user:{select:{
          name:true,displayName:true,avatarUrl:true,
          profile:{select:{mmr:true}},
        }},
      },
    });
    return c.json(messages.reverse().map(m=>({
      id:m.id, competitionId:m.competitionId, userId:m.userId,
      body:m.body,createdAt:m.createdAt.toISOString(),
      name:m.user.name,displayName:m.user.displayName,
      avatarUrl:m.user.avatarUrl,mmr:m.user.profile?.mmr??1500,
    })));
  }
  const rows = await db.$queryRaw<ChatRow[]>`
    SELECT
      m."id",
      m."competitionId",
      m."userId",
      m."body",
      m."createdAt",
      u."name",
      u."displayName",
      u."avatarUrl",
      COALESCE(p."mmr", 1500)::int AS "mmr"
    FROM "CompetitionChatMessage" m
    JOIN "User" u ON u."id" = m."userId"
    LEFT JOIN "UserProfile" p ON p."userId" = m."userId"
    WHERE m."competitionId" = ${competitionId}::uuid
    ORDER BY m."createdAt" DESC
    LIMIT 80
  `;

  return c.json(rows.reverse().map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  })));
});

competitionChat.post('/:id/chat', async (c) => {
  const competitionId = c.req.param('id');
  const parsed = messageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_MESSAGE' }, 400);
  if (violatesChatSafetyPolicy(parsed.data.body)) {
    return c.json({ error: 'CHAT_SAFETY_BLOCKED', message: CHAT_SAFETY_MESSAGE }, 400);
  }
  if (!await canAccessCompetition(c, competitionId)) {
    return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);
  }

  const db = c.get('prisma');
  const user = c.get('user');
  const id = crypto.randomUUID();
  if(c.env.DB){
    const now=new Date();
    const cutoff=new Date(now.getTime()-2_000).toISOString();
    const result=await c.env.DB.prepare(`
      INSERT INTO "CompetitionChatMessage"
        ("id","competitionId","userId","body","createdAt")
      SELECT ?1,?2,?3,?4,?5
      WHERE NOT EXISTS (
        SELECT 1 FROM "CompetitionChatMessage"
        WHERE "competitionId"=?2 AND "userId"=?3 AND "createdAt">?6
      )
    `).bind(id,competitionId,user.id,parsed.data.body,now.toISOString(),cutoff).run();
    if(result.meta.changes!==1){
      return c.json({error:'CHAT_RATE_LIMIT',
        message:'Aguarde um instante antes de enviar outra mensagem.'},429);
    }
    return c.json({id,body:parsed.data.body,createdAt:now.toISOString()},201);
  }
  const inserted = await db.$executeRaw`
    INSERT INTO "CompetitionChatMessage" ("id", "competitionId", "userId", "body", "createdAt")
    SELECT ${id}::uuid, ${competitionId}::uuid, ${user.id}::uuid, ${parsed.data.body}, CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1
      FROM "CompetitionChatMessage"
      WHERE "competitionId" = ${competitionId}::uuid
        AND "userId" = ${user.id}::uuid
        AND "createdAt" > CURRENT_TIMESTAMP - INTERVAL '2 seconds'
    )
  `;

  if (inserted !== 1) {
    return c.json({ error: 'CHAT_RATE_LIMIT', message: 'Aguarde um instante antes de enviar outra mensagem.' }, 429);
  }

  return c.json({ id, body: parsed.data.body, createdAt: new Date().toISOString() }, 201);
});
