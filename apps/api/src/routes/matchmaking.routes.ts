import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';
import { calculateElo, DEFAULT_MMR } from '../domain/ranking/elo';
import { sendPushToUsers } from '../services/push.service';

export const matchmaking = new Hono<Env>();
type Tx = Prisma.TransactionClient;

const platformSchema = z.enum(['PS4', 'XBOX_ONE', 'PS5', 'XBOX_SERIES', 'PC']);
const poolSchema = z.enum(['ALL', 'LEGACY', 'CURRENT']);
const modeSchema = z.enum(['CASUAL', 'RANKED']);
const challengeSchema = z.object({
  challengedUserId: z.string().uuid(),
  mode: modeSchema.default('CASUAL'),
});
const availabilitySchema = z.object({ platform: platformSchema });
const responseSchema = z.object({ action: z.enum(['ACCEPT', 'DECLINE']) });
const handleSchema = z.object({
  handle: z.string().trim().min(2).max(40),
});
const scoreSchema = z.object({
  myScore: z.coerce.number().int().min(0).max(99),
  opponentScore: z.coerce.number().int().min(0).max(99),
});

const LEGACY_PLATFORMS = ['PS4', 'XBOX_ONE'] as const;
const CURRENT_PLATFORMS = ['PS5', 'XBOX_SERIES', 'PC'] as const;
const ACTIVE_ROOM_STATUSES = ['OPEN', 'AWAITING_CONFIRMATION'] as const;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

const roomSelect = {
  id: true,
  challengeId: true,
  challengerId: true,
  challengedId: true,
  challengerPlatform: true,
  challengedPlatform: true,
  mode: true,
  status: true,
  challengerHandle: true,
  challengedHandle: true,
  challengerScore: true,
  challengedScore: true,
  scoreSubmittedById: true,
  scoreConfirmedById: true,
  challengerMmrDelta: true,
  challengedMmrDelta: true,
  mmrAppliedAt: true,
  finishedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  challenger: {
    select: {
      id: true,
      name: true,
      displayName: true,
      avatarUrl: true,
      profile: { select: { mmr: true } },
    },
  },
  challenged: {
    select: {
      id: true,
      name: true,
      displayName: true,
      avatarUrl: true,
      profile: { select: { mmr: true } },
    },
  },
} satisfies Prisma.CasualMatchRoomSelect;

type RoomRecord = Prisma.CasualMatchRoomGetPayload<{ select: typeof roomSelect }>;
type QueueRecord = { userId: string; platform: string; expiresAt: Date };
type AvailablePlayerRow = {
  queueId: string;
  userId: string;
  platform: string;
  expiresAt: Date;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  mmr: number;
};

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    PS4: 'PS4',
    XBOX_ONE: 'Xbox One',
    PS5: 'PS5',
    XBOX_SERIES: 'Xbox Series',
    PC: 'PC',
  };
  return labels[platform] ?? platform;
}

function crossplayPool(platform: string): 'LEGACY' | 'CURRENT' | null {
  if ((LEGACY_PLATFORMS as readonly string[]).includes(platform)) return 'LEGACY';
  if ((CURRENT_PLATFORMS as readonly string[]).includes(platform)) return 'CURRENT';
  return null;
}

async function lockUsers(tx: Tx, userIds: readonly string[]): Promise<void> {
  const ordered = [...new Set(userIds)].sort();
  for (const userId of ordered) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`lfg-user:${userId}`}))`;
  }
}

async function lockRoom(tx: Tx, roomId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`lfg-room:${roomId}`}))`;
}

async function activeQueueForUser(tx: Tx, userId: string): Promise<QueueRecord | null> {
  const rows = await tx.$queryRaw<QueueRecord[]>(Prisma.sql`
    SELECT "userId", "platform", "expiresAt"
    FROM "MatchmakingQueue"
    WHERE "userId" = ${userId}::uuid
      AND "status" = 'ACTIVE'
      AND "expiresAt" > NOW()
    LIMIT 1
  `);
  return rows[0] ?? null;
}

function serializeRoom(room: RoomRecord, currentUserId: string) {
  const isChallenger = room.challengerId === currentUserId;
  return {
    id: room.id,
    challengeId: room.challengeId,
    mode: room.mode,
    status: room.status,
    currentUserId,
    isChallenger,
    scoreSubmittedById: room.scoreSubmittedById,
    canConfirmScore:
      room.status === 'AWAITING_CONFIRMATION'
      && Boolean(room.scoreSubmittedById)
      && room.scoreSubmittedById !== currentUserId,
    version: room.version,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    finishedAt: room.finishedAt,
    challenger: {
      id: room.challenger.id,
      name: room.challenger.displayName ?? room.challenger.name,
      avatarUrl: room.challenger.avatarUrl,
      mmr: room.challenger.profile?.mmr ?? DEFAULT_MMR,
      platform: room.challengerPlatform,
      handle: room.challengerHandle,
      score: room.challengerScore,
      mmrDelta: room.challengerMmrDelta,
    },
    challenged: {
      id: room.challenged.id,
      name: room.challenged.displayName ?? room.challenged.name,
      avatarUrl: room.challenged.avatarUrl,
      mmr: room.challenged.profile?.mmr ?? DEFAULT_MMR,
      platform: room.challengedPlatform,
      handle: room.challengedHandle,
      score: room.challengedScore,
      mmrDelta: room.challengedMmrDelta,
    },
  };
}

async function expirePendingChallenges(db: Tx | Env['Variables']['prisma']): Promise<void> {
  await db.matchmakingChallenge.updateMany({
    where: { status: 'PENDING', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
}

matchmaking.get('/availability', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  await db.matchmakingQueue.deleteMany({
    where: { userId: user.id, status: 'ACTIVE', expiresAt: { lte: new Date() } },
  });
  const queue = await db.matchmakingQueue.findUnique({ where: { userId: user.id } });
  return c.json({ queue });
});

matchmaking.post('/availability', async (c) => {
  const parsed = availabilitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_PLATFORM' }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const id = crypto.randomUUID();
  const rows = await db.$queryRaw<Array<{ id: string; platform: string; status: string; expiresAt: Date }>>(Prisma.sql`
    INSERT INTO "MatchmakingQueue" ("id", "userId", "platform", "status", "expiresAt", "createdAt", "updatedAt")
    VALUES (${id}::uuid, ${user.id}::uuid, ${parsed.data.platform}, 'ACTIVE', NOW() + INTERVAL '1 hour', NOW(), NOW())
    ON CONFLICT ("userId") DO UPDATE SET
      "platform" = EXCLUDED."platform",
      "status" = 'ACTIVE',
      "expiresAt" = NOW() + INTERVAL '1 hour',
      "updatedAt" = NOW()
    RETURNING "id", "platform", "status"::text AS "status", "expiresAt"
  `);

  return c.json({ queue: rows[0] }, 201);
});

matchmaking.delete('/availability', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  await db.$transaction(async (tx) => {
    await lockUsers(tx, [user.id]);
    await tx.matchmakingQueue.deleteMany({ where: { userId: user.id } });
    await tx.matchmakingChallenge.updateMany({
      where: {
        status: 'PENDING',
        OR: [{ challengerId: user.id }, { challengedId: user.id }],
      },
      data: { status: 'CANCELED' },
    });
  });
  return c.json({ ok: true });
});

matchmaking.get('/players', async (c) => {
  const parsedPool = poolSchema.safeParse(c.req.query('pool') ?? 'ALL');
  if (!parsedPool.success) return c.json({ error: 'INVALID_POOL' }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const poolClause = parsedPool.data === 'LEGACY'
    ? Prisma.sql`AND q."platform" IN ('PS4', 'XBOX_ONE')`
    : parsedPool.data === 'CURRENT'
      ? Prisma.sql`AND q."platform" IN ('PS5', 'XBOX_SERIES', 'PC')`
      : Prisma.empty;

  // Critical anti-ghost predicate uses PostgreSQL NOW(), not client time.
  // The composite indexes start with status/platform then expiresAt, so expired
  // rows are discarded by the index range before player/profile joins fan out.
  const players = await db.$queryRaw<AvailablePlayerRow[]>(Prisma.sql`
    SELECT
      q."id" AS "queueId",
      q."userId",
      q."platform",
      q."expiresAt",
      u."name",
      u."displayName",
      u."avatarUrl",
      COALESCE(p."mmr", ${DEFAULT_MMR})::int AS "mmr"
    FROM "MatchmakingQueue" q
    INNER JOIN "User" u ON u."id" = q."userId" AND u."isActive" = true
    LEFT JOIN "UserProfile" p ON p."userId" = q."userId"
    WHERE q."status" = 'ACTIVE'
      AND q."expiresAt" > NOW()
      AND q."userId" <> ${user.id}::uuid
      ${poolClause}
    ORDER BY q."expiresAt" DESC
    LIMIT 60
  `);

  return c.json({ players });
});

matchmaking.get('/challenges', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  await expirePendingChallenges(db);

  const [incoming, outgoing] = await Promise.all([
    db.matchmakingChallenge.findMany({
      where: { challengedId: user.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        mode: true,
        challengerPlatform: true,
        challengedPlatform: true,
        expiresAt: true,
        challenger: {
          select: {
            id: true,
            name: true,
            displayName: true,
            avatarUrl: true,
            profile: { select: { mmr: true } },
          },
        },
      },
    }),
    db.matchmakingChallenge.findFirst({
      where: { challengerId: user.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        mode: true,
        challengerPlatform: true,
        challengedPlatform: true,
        expiresAt: true,
        challenged: {
          select: { id: true, name: true, displayName: true, avatarUrl: true },
        },
      },
    }),
  ]);

  return c.json({
    incoming: incoming.map((challenge) => ({
      ...challenge,
      challenger: {
        id: challenge.challenger.id,
        name: challenge.challenger.displayName ?? challenge.challenger.name,
        avatarUrl: challenge.challenger.avatarUrl,
        mmr: challenge.challenger.profile?.mmr ?? DEFAULT_MMR,
      },
    })),
    outgoing: outgoing ? {
      ...outgoing,
      challenged: {
        id: outgoing.challenged.id,
        name: outgoing.challenged.displayName ?? outgoing.challenged.name,
        avatarUrl: outgoing.challenged.avatarUrl,
      },
    } : null,
  });
});

matchmaking.post('/challenges', async (c) => {
  const parsed = challengeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_CHALLENGE' }, 400);

  const db = c.get('prisma');
  const challenger = c.get('user');
  const challengedUserId = parsed.data.challengedUserId;
  if (challengedUserId === challenger.id) return c.json({ error: 'CANNOT_CHALLENGE_SELF' }, 400);

  const result = await db.$transaction(async (tx) => {
    await lockUsers(tx, [challenger.id, challengedUserId]);
    await expirePendingChallenges(tx);

    const [challengerQueue, challengedQueue] = await Promise.all([
      activeQueueForUser(tx, challenger.id),
      activeQueueForUser(tx, challengedUserId),
    ]);
    if (!challengerQueue) return { error: 'YOU_ARE_NOT_AVAILABLE' as const };
    if (!challengedQueue) return { error: 'PLAYER_NOT_AVAILABLE' as const };
    if (!crossplayPool(challengerQueue.platform) || crossplayPool(challengerQueue.platform) !== crossplayPool(challengedQueue.platform)) {
      return { error: 'CROSSPLAY_INCOMPATIBLE' as const };
    }

    const existingOutgoing = await tx.matchmakingChallenge.findFirst({
      where: {
        challengerId: challenger.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (existingOutgoing) return { error: 'CHALLENGE_ALREADY_PENDING' as const };

    const duplicate = await tx.matchmakingChallenge.findFirst({
      where: {
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        OR: [
          { challengerId: challenger.id, challengedId: challengedUserId },
          { challengerId: challengedUserId, challengedId: challenger.id },
        ],
      },
      select: { id: true },
    });
    if (duplicate) return { error: 'CHALLENGE_ALREADY_PENDING' as const };

    const challenge = await tx.matchmakingChallenge.create({
      data: {
        challengerId: challenger.id,
        challengedId: challengedUserId,
        challengerPlatform: challengerQueue.platform,
        challengedPlatform: challengedQueue.platform,
        mode: parsed.data.mode,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
      select: { id: true, mode: true, expiresAt: true, challengerPlatform: true },
    });
    return { challenge };
  });

  if ('error' in result) {
    const status = result.error === 'CROSSPLAY_INCOMPATIBLE' ? 409 : result.error === 'CHALLENGE_ALREADY_PENDING' ? 409 : 409;
    return c.json({ error: result.error }, status);
  }

  c.executionCtx.waitUntil(sendPushToUsers(db, c.env, [challengedUserId], {
    title: 'Desafio no Chavea 🔥',
    body: `🔥 ${challenger.displayName ?? challenger.name} te desafiou para uma partida no ${platformLabel(result.challenge.challengerPlatform)}! Entre agora.`,
    url: '/play',
    tag: `lfg-${result.challenge.id.slice(0, 20)}`,
  }));

  return c.json({ challenge: result.challenge }, 201);
});

matchmaking.post('/challenges/:id/respond', async (c) => {
  const parsed = responseSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_RESPONSE' }, 400);

  const db = c.get('prisma');
  const currentUser = c.get('user');
  const challengeId = c.req.param('id');

  const result = await db.$transaction(async (tx) => {
    const initial = await tx.matchmakingChallenge.findUnique({
      where: { id: challengeId },
      select: { challengerId: true, challengedId: true },
    });
    if (!initial) return { error: 'CHALLENGE_NOT_FOUND' as const };
    if (initial.challengedId !== currentUser.id) return { error: 'FORBIDDEN' as const };

    await lockUsers(tx, [initial.challengerId, initial.challengedId]);
    const challenge = await tx.matchmakingChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge) return { error: 'CHALLENGE_NOT_FOUND' as const };
    if (challenge.status !== 'PENDING') return { error: 'CHALLENGE_NOT_PENDING' as const };
    if (challenge.expiresAt <= new Date()) {
      await tx.matchmakingChallenge.update({ where: { id: challenge.id }, data: { status: 'EXPIRED' } });
      return { error: 'CHALLENGE_EXPIRED' as const };
    }

    if (parsed.data.action === 'DECLINE') {
      await tx.matchmakingChallenge.update({ where: { id: challenge.id }, data: { status: 'DECLINED' } });
      return { declined: true as const, challengerId: challenge.challengerId };
    }

    const room = await tx.casualMatchRoom.create({
      data: {
        challengeId: challenge.id,
        challengerId: challenge.challengerId,
        challengedId: challenge.challengedId,
        challengerPlatform: challenge.challengerPlatform,
        challengedPlatform: challenge.challengedPlatform,
        mode: challenge.mode,
      },
      select: { id: true },
    });
    await tx.matchmakingChallenge.update({
      where: { id: challenge.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    await tx.matchmakingQueue.updateMany({
      where: { userId: { in: [challenge.challengerId, challenge.challengedId] } },
      data: { status: 'IN_GAME' },
    });
    await tx.matchmakingChallenge.updateMany({
      where: {
        id: { not: challenge.id },
        status: 'PENDING',
        OR: [
          { challengerId: { in: [challenge.challengerId, challenge.challengedId] } },
          { challengedId: { in: [challenge.challengerId, challenge.challengedId] } },
        ],
      },
      data: { status: 'CANCELED' },
    });

    return { roomId: room.id, challengerId: challenge.challengerId };
  });

  if ('error' in result) {
    const status = result.error === 'FORBIDDEN' ? 403 : result.error === 'CHALLENGE_NOT_FOUND' ? 404 : 409;
    return c.json({ error: result.error }, status);
  }

  if ('declined' in result) return c.json({ ok: true, status: 'DECLINED' });

  c.executionCtx.waitUntil(sendPushToUsers(db, c.env, [result.challengerId], {
    title: 'Desafio aceito! 🎮',
    body: `🔥 ${currentUser.displayName ?? currentUser.name} aceitou seu desafio. A sala está pronta!`,
    url: `/play/rooms/${result.roomId}`,
    tag: `room-${result.roomId.slice(0, 20)}`,
  }));

  return c.json({ ok: true, status: 'ACCEPTED', roomId: result.roomId });
});

matchmaking.get('/rooms/active', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const room = await db.casualMatchRoom.findFirst({
    where: {
      status: { in: [...ACTIVE_ROOM_STATUSES] },
      OR: [{ challengerId: user.id }, { challengedId: user.id }],
    },
    orderBy: { updatedAt: 'desc' },
    select: roomSelect,
  });
  return c.json({ room: room ? serializeRoom(room, user.id) : null });
});

matchmaking.get('/rooms/:id', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const room = await db.casualMatchRoom.findFirst({
    where: {
      id: c.req.param('id'),
      OR: [{ challengerId: user.id }, { challengedId: user.id }],
    },
    select: roomSelect,
  });
  if (!room) return c.json({ error: 'ROOM_NOT_FOUND' }, 404);
  return c.json({ room: serializeRoom(room, user.id) });
});

matchmaking.patch('/rooms/:id/handle', async (c) => {
  const parsed = handleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_HANDLE' }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const roomId = c.req.param('id');
  const result = await db.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const room = await tx.casualMatchRoom.findUnique({ where: { id: roomId } });
    if (!room) return { error: 'ROOM_NOT_FOUND' as const };
    if (room.challengerId !== user.id && room.challengedId !== user.id) return { error: 'FORBIDDEN' as const };
    if (!ACTIVE_ROOM_STATUSES.includes(room.status as (typeof ACTIVE_ROOM_STATUSES)[number])) return { error: 'ROOM_CLOSED' as const };

    const updated = await tx.casualMatchRoom.update({
      where: { id: room.id },
      data: room.challengerId === user.id
        ? { challengerHandle: parsed.data.handle }
        : { challengedHandle: parsed.data.handle },
      select: roomSelect,
    });
    return { room: updated };
  });

  if ('error' in result) return c.json({ error: result.error }, result.error === 'FORBIDDEN' ? 403 : result.error === 'ROOM_NOT_FOUND' ? 404 : 409);
  return c.json({ room: serializeRoom(result.room, user.id) });
});

matchmaking.post('/rooms/:id/score', async (c) => {
  const parsed = scoreSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_SCORE' }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const roomId = c.req.param('id');
  const result = await db.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const room = await tx.casualMatchRoom.findUnique({ where: { id: roomId } });
    if (!room) return { error: 'ROOM_NOT_FOUND' as const };
    const isChallenger = room.challengerId === user.id;
    if (!isChallenger && room.challengedId !== user.id) return { error: 'FORBIDDEN' as const };
    if (room.status !== 'OPEN') return { error: 'SCORE_ALREADY_PENDING' as const };

    const challengerScore = isChallenger ? parsed.data.myScore : parsed.data.opponentScore;
    const challengedScore = isChallenger ? parsed.data.opponentScore : parsed.data.myScore;
    await tx.casualMatchRoom.update({
      where: { id: room.id },
      data: {
        challengerScore,
        challengedScore,
        scoreSubmittedById: user.id,
        scoreConfirmedById: null,
        status: 'AWAITING_CONFIRMATION',
        version: { increment: 1 },
      },
    });
    return {
      opponentId: isChallenger ? room.challengedId : room.challengerId,
      challengerScore,
      challengedScore,
    };
  });

  if ('error' in result) return c.json({ error: result.error }, result.error === 'FORBIDDEN' ? 403 : result.error === 'ROOM_NOT_FOUND' ? 404 : 409);

  c.executionCtx.waitUntil(sendPushToUsers(db, c.env, [result.opponentId], {
    title: 'Placar para confirmar 📊',
    body: `${user.displayName ?? user.name} enviou o placar ${result.challengerScore} × ${result.challengedScore}. Confirme na sala.`,
    url: `/play/rooms/${roomId}`,
    tag: `score-${roomId.slice(0, 20)}`,
  }));

  return c.json({ ok: true });
});

matchmaking.post('/rooms/:id/score/reject', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const roomId = c.req.param('id');
  const result = await db.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const room = await tx.casualMatchRoom.findUnique({ where: { id: roomId } });
    if (!room) return { error: 'ROOM_NOT_FOUND' as const };
    if (room.challengerId !== user.id && room.challengedId !== user.id) return { error: 'FORBIDDEN' as const };
    if (room.status !== 'AWAITING_CONFIRMATION' || !room.scoreSubmittedById) return { error: 'NO_SCORE_TO_REJECT' as const };
    if (room.scoreSubmittedById === user.id) return { error: 'SUBMITTER_CANNOT_REJECT' as const };

    const submitterId = room.scoreSubmittedById;
    await tx.casualMatchRoom.update({
      where: { id: room.id },
      data: {
        status: 'OPEN',
        challengerScore: null,
        challengedScore: null,
        scoreSubmittedById: null,
        scoreConfirmedById: null,
        version: { increment: 1 },
      },
    });
    return { submitterId };
  });

  if ('error' in result) return c.json({ error: result.error }, result.error === 'FORBIDDEN' ? 403 : result.error === 'ROOM_NOT_FOUND' ? 404 : 409);
  c.executionCtx.waitUntil(sendPushToUsers(db, c.env, [result.submitterId], {
    title: 'Placar não confirmado',
    body: `${user.displayName ?? user.name} pediu a correção do placar.`,
    url: `/play/rooms/${roomId}`,
    tag: `score-reject-${roomId.slice(0, 13)}`,
  }));
  return c.json({ ok: true });
});

matchmaking.post('/rooms/:id/score/confirm', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const roomId = c.req.param('id');

  const result = await db.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const room = await tx.casualMatchRoom.findUnique({ where: { id: roomId } });
    if (!room) return { error: 'ROOM_NOT_FOUND' as const };
    if (room.challengerId !== user.id && room.challengedId !== user.id) return { error: 'FORBIDDEN' as const };
    if (room.status !== 'AWAITING_CONFIRMATION' || room.challengerScore == null || room.challengedScore == null || !room.scoreSubmittedById) {
      return { error: 'NO_SCORE_TO_CONFIRM' as const };
    }
    if (room.scoreSubmittedById === user.id) return { error: 'SUBMITTER_CANNOT_CONFIRM' as const };

    await lockUsers(tx, [room.challengerId, room.challengedId]);
    let challengerDelta: number | null = null;
    let challengedDelta: number | null = null;

    if (room.mode === 'RANKED' && !room.mmrAppliedAt) {
      const [challengerProfile, challengedProfile] = await Promise.all([
        tx.userProfile.upsert({
          where: { userId: room.challengerId },
          create: { userId: room.challengerId },
          update: {},
          select: { mmr: true },
        }),
        tx.userProfile.upsert({
          where: { userId: room.challengedId },
          create: { userId: room.challengedId },
          update: {},
          select: { mmr: true },
        }),
      ]);
      const outcome = room.challengerScore > room.challengedScore
        ? 'HOME_WIN'
        : room.challengerScore < room.challengedScore
          ? 'AWAY_WIN'
          : 'DRAW';
      const elo = calculateElo(challengerProfile.mmr, challengedProfile.mmr, outcome);
      challengerDelta = elo.homeDelta;
      challengedDelta = elo.awayDelta;
      await Promise.all([
        tx.userProfile.update({ where: { userId: room.challengerId }, data: { mmr: { increment: challengerDelta } } }),
        tx.userProfile.update({ where: { userId: room.challengedId }, data: { mmr: { increment: challengedDelta } } }),
      ]);
    }

    const finished = await tx.casualMatchRoom.update({
      where: { id: room.id },
      data: {
        status: 'FINISHED',
        scoreConfirmedById: user.id,
        challengerMmrDelta: challengerDelta,
        challengedMmrDelta: challengedDelta,
        mmrAppliedAt: room.mode === 'RANKED' ? new Date() : null,
        finishedAt: new Date(),
        version: { increment: 1 },
      },
      select: { scoreSubmittedById: true },
    });
    await tx.matchmakingQueue.deleteMany({
      where: { userId: { in: [room.challengerId, room.challengedId] } },
    });

    return { submitterId: finished.scoreSubmittedById, challengerDelta, challengedDelta };
  });

  if ('error' in result) return c.json({ error: result.error }, result.error === 'FORBIDDEN' ? 403 : result.error === 'ROOM_NOT_FOUND' ? 404 : 409);
  if (result.submitterId) {
    c.executionCtx.waitUntil(sendPushToUsers(db, c.env, [result.submitterId], {
      title: 'Resultado confirmado ✅',
      body: result.challengerDelta == null
        ? 'Seu adversário confirmou o placar da partida casual.'
        : 'Seu adversário confirmou o placar. O MMR foi atualizado!',
      url: `/play/rooms/${roomId}`,
      tag: `result-${roomId.slice(0, 19)}`,
    }));
  }
  return c.json({ ok: true, mmr: { challengerDelta: result.challengerDelta, challengedDelta: result.challengedDelta } });
});

matchmaking.post('/rooms/:id/cancel', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const roomId = c.req.param('id');
  const result = await db.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const room = await tx.casualMatchRoom.findUnique({ where: { id: roomId } });
    if (!room) return { error: 'ROOM_NOT_FOUND' as const };
    if (room.challengerId !== user.id && room.challengedId !== user.id) return { error: 'FORBIDDEN' as const };
    if (room.status === 'FINISHED' || room.status === 'CANCELED') return { error: 'ROOM_CLOSED' as const };

    await tx.casualMatchRoom.update({
      where: { id: room.id },
      data: { status: 'CANCELED', finishedAt: new Date(), version: { increment: 1 } },
    });
    await tx.matchmakingQueue.deleteMany({ where: { userId: { in: [room.challengerId, room.challengedId] } } });
    return { ok: true as const };
  });

  if ('error' in result) return c.json({ error: result.error }, result.error === 'FORBIDDEN' ? 403 : result.error === 'ROOM_NOT_FOUND' ? 404 : 409);
  return c.json({ ok: true });
});
