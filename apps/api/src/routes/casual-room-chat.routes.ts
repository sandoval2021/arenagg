import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { CHAT_SAFETY_MESSAGE, violatesChatSafetyPolicy } from '../services/chat-safety.service';

export const casualRoomChat = new Hono<Env>();

const messageSchema = z.object({
  body: z.string().trim().min(1).max(280),
});

type RoomAccess = {
  challengerId: string;
  challengedId: string;
  status: string;
};

type ChatRow = {
  id: string;
  roomId: string;
  userId: string;
  body: string;
  createdAt: Date;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
};

async function getRoomAccess(
  db: Env['Variables']['prisma'],
  roomId: string,
  userId: string,
): Promise<RoomAccess | null> {
  if (!z.string().uuid().safeParse(roomId).success) return null;

  const room = await db.casualMatchRoom.findFirst({
    where: {
      id: roomId,
      OR: [{ challengerId: userId }, { challengedId: userId }],
    },
    select: { challengerId: true, challengedId: true, status: true },
  });
  return room;
}

casualRoomChat.get('/rooms/:id/chat', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const roomId = c.req.param('id');
  const room = await getRoomAccess(db, roomId, user.id);
  if (!room) return c.json({ error: 'ROOM_NOT_FOUND' }, 404);

  const rows = await db.$queryRaw<ChatRow[]>`
    SELECT
      m."id",
      m."roomId",
      m."userId",
      m."body",
      m."createdAt",
      u."name",
      u."displayName",
      u."avatarUrl"
    FROM "CasualRoomChatMessage" m
    JOIN "User" u ON u."id" = m."userId"
    WHERE m."roomId" = ${roomId}::uuid
    ORDER BY m."createdAt" DESC
    LIMIT 40
  `;

  return c.json({
    messages: rows.reverse().map((row) => ({
      ...row,
      name: row.displayName ?? row.name,
      createdAt: row.createdAt.toISOString(),
    })),
    canSend: room.status === 'OPEN' || room.status === 'AWAITING_CONFIRMATION',
  });
});

casualRoomChat.post('/rooms/:id/chat', async (c) => {
  const parsed = messageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_MESSAGE' }, 400);
  if (violatesChatSafetyPolicy(parsed.data.body)) {
    return c.json({ error: 'CHAT_SAFETY_BLOCKED', message: CHAT_SAFETY_MESSAGE }, 400);
  }

  const db = c.get('prisma');
  const user = c.get('user');
  const roomId = c.req.param('id');
  const room = await getRoomAccess(db, roomId, user.id);
  if (!room) return c.json({ error: 'ROOM_NOT_FOUND' }, 404);
  if (room.status !== 'OPEN' && room.status !== 'AWAITING_CONFIRMATION') {
    return c.json({ error: 'ROOM_CHAT_CLOSED', message: 'O chat deste amistoso já foi encerrado.' }, 409);
  }

  const id = crypto.randomUUID();
  const inserted = await db.$executeRaw`
    INSERT INTO "CasualRoomChatMessage" ("id", "roomId", "userId", "body", "createdAt")
    SELECT ${id}::uuid, ${roomId}::uuid, ${user.id}::uuid, ${parsed.data.body}, CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1
      FROM "CasualRoomChatMessage"
      WHERE "roomId" = ${roomId}::uuid
        AND "userId" = ${user.id}::uuid
        AND "createdAt" > CURRENT_TIMESTAMP - INTERVAL '2 seconds'
    )
  `;

  if (inserted !== 1) {
    return c.json({ error: 'CHAT_RATE_LIMIT', message: 'Aguarde um instante antes de enviar outra mensagem.' }, 429);
  }

  return c.json({ id, roomId, userId: user.id, body: parsed.data.body, createdAt: new Date().toISOString() }, 201);
});
