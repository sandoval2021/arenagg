import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { evaluateFriendAchievements } from '../services/achievement-engine.service';

export const friends = new Hono<Env>();

const friendRequestSchema = z.object({ friendId: z.string().uuid() });

type FriendRequestResult = {
  state: 'ACCEPTED' | 'PENDING';
  friendship: { id: string };
};

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

friends.post('/request', async (c) => {
  const user = c.get('user');
  const parsed = friendRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_FRIEND_REQUEST' }, 400);
  if (parsed.data.friendId === user.id) return c.json({ error: 'CANNOT_FRIEND_SELF' }, 400);

  const db = c.get('prisma');
  const friend = await db.user.findUnique({ where: { id: parsed.data.friendId }, select: { id: true, isActive: true } });
  if (!friend?.isActive) return c.json({ error: 'USER_NOT_FOUND' }, 404);

  const [left, right] = orderedPair(user.id, parsed.data.friendId);
  const requestId = crypto.randomUUID();
  let result: FriendRequestResult;
  try {
    result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`friend:${left}:${right}`}))`;
    const existing = await tx.friendship.findFirst({
      where: {
        OR: [
          { requesterId: user.id, addresseeId: parsed.data.friendId },
          { requesterId: parsed.data.friendId, addresseeId: user.id },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') return { state: 'ACCEPTED' as const, friendship: existing };
      if (existing.status === 'PENDING') {
        if (existing.requesterId === parsed.data.friendId) {
          const friendship = await tx.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
          return { state: 'ACCEPTED' as const, friendship };
        }
        return { state: 'PENDING' as const, friendship: existing };
      }
      const friendship = await tx.friendship.update({
        where: { id: existing.id },
        data: { requesterId: user.id, addresseeId: parsed.data.friendId, status: 'PENDING' },
      });
      return { state: 'PENDING' as const, friendship };
    }

      const friendship = await tx.friendship.create({ data: { requesterId: user.id, addresseeId: parsed.data.friendId } });
      return { state: 'PENDING' as const, friendship };
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    const prismaCode = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
    console.error('[friends.request] failed', {
      requestId,
      requesterId: user.id,
      friendId: parsed.data.friendId,
      prismaCode: prismaCode || undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    if (prismaCode === 'P2002') {
      return c.json({
        error: 'FRIEND_REQUEST_CONFLICT',
        message: 'Este convite já existe ou acabou de ser processado.',
        requestId,
      }, 409);
    }
    return c.json({
      error: 'FRIEND_REQUEST_FAILED',
      message: 'Não foi possível enviar o convite agora. Tente novamente.',
      requestId,
    }, 500);
  }

  if (result.state === 'ACCEPTED') {
    await Promise.all([
      evaluateFriendAchievements(db, user.id),
      evaluateFriendAchievements(db, parsed.data.friendId),
    ]);
  }
  return c.json({ id: result.friendship.id, status: result.state }, result.state === 'ACCEPTED' ? 200 : 201);
});

friends.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('prisma');
  const rows = await db.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: {
      requester: { select: { id: true, name: true, displayName: true, avatarUrl: true, profile: { select: { consoles: true } } } },
      addressee: { select: { id: true, name: true, displayName: true, avatarUrl: true, profile: { select: { consoles: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return c.json(rows.map((row) => {
    const friend = row.requesterId === user.id ? row.addressee : row.requester;
    return {
      friendshipId: row.id,
      id: friend.id,
      name: friend.name,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
      consoles: friend.profile?.consoles ?? [],
    };
  }));
});

friends.get('/requests', async (c) => {
  const user = c.get('user');
  const db = c.get('prisma');
  const rows = await db.friendship.findMany({
    where: { addresseeId: user.id, status: 'PENDING' },
    include: { requester: { select: { id: true, name: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(rows.map((row) => ({ friendshipId: row.id, user: row.requester })));
});

friends.post('/:id/accept', async (c) => {
  const user = c.get('user');
  const db = c.get('prisma');
  const row = await db.friendship.findFirst({
    where: { id: c.req.param('id'), addresseeId: user.id, status: 'PENDING' },
  });
  if (!row) return c.json({ error: 'FRIEND_REQUEST_NOT_FOUND' }, 404);
  const updated = await db.friendship.update({ where: { id: row.id }, data: { status: 'ACCEPTED' } });
  await Promise.all([
    evaluateFriendAchievements(db, row.requesterId),
    evaluateFriendAchievements(db, row.addresseeId),
  ]);
  return c.json({ id: updated.id, status: updated.status });
});

friends.post('/:id/reject', async (c) => {
  const user = c.get('user');
  const db = c.get('prisma');
  const row = await db.friendship.findFirst({
    where: { id: c.req.param('id'), addresseeId: user.id, status: 'PENDING' },
  });
  if (!row) return c.json({ error: 'FRIEND_REQUEST_NOT_FOUND' }, 404);
  const updated = await db.friendship.update({ where: { id: row.id }, data: { status: 'REJECTED' } });
  return c.json({ id: updated.id, status: updated.status });
});