import { Hono } from 'hono';
import type { Env } from '../types/env';
import { sendPushToUsers } from '../services/push.service';

export const matchmakingUnranked = new Hono<Env>();

/**
 * Product invariant: LFG rooms are friendlies. This route is mounted before the
 * legacy Phase 7 router so score confirmation can never enter its historical
 * ranked/Elo branch. The database also enforces CASUAL-only rows as defense in depth.
 */
matchmakingUnranked.post('/rooms/:id/score/confirm', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const roomId = c.req.param('id');

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`lfg-room:${roomId}`}))`;

    const room = await tx.casualMatchRoom.findUnique({ where: { id: roomId } });
    if (!room) return { error: 'ROOM_NOT_FOUND' as const };
    if (room.challengerId !== user.id && room.challengedId !== user.id) {
      return { error: 'FORBIDDEN' as const };
    }
    if (
      room.status !== 'AWAITING_CONFIRMATION'
      || room.challengerScore == null
      || room.challengedScore == null
      || !room.scoreSubmittedById
    ) {
      return { error: 'NO_SCORE_TO_CONFIRM' as const };
    }
    if (room.scoreSubmittedById === user.id) {
      return { error: 'SUBMITTER_CANNOT_CONFIRM' as const };
    }

    const finished = await tx.casualMatchRoom.update({
      where: { id: room.id },
      data: {
        mode: 'CASUAL',
        status: 'FINISHED',
        scoreConfirmedById: user.id,
        challengerMmrDelta: null,
        challengedMmrDelta: null,
        mmrAppliedAt: null,
        finishedAt: new Date(),
        version: { increment: 1 },
      },
      select: {
        scoreSubmittedById: true,
        challengerId: true,
        challengedId: true,
      },
    });

    await tx.matchmakingQueue.deleteMany({
      where: { userId: { in: [finished.challengerId, finished.challengedId] } },
    });

    return { submitterId: finished.scoreSubmittedById };
  });

  if ('error' in result) {
    const status = result.error === 'FORBIDDEN'
      ? 403
      : result.error === 'ROOM_NOT_FOUND'
        ? 404
        : 409;
    return c.json({ error: result.error }, status);
  }

  if (result.submitterId) {
    c.executionCtx.waitUntil(sendPushToUsers(db, c.env, [result.submitterId], {
      title: 'Amistoso confirmado ✅',
      body: 'Seu adversário confirmou o placar. O resultado entrou no H2H e o MMR continua intacto.',
      url: `/play/rooms/${roomId}`,
      tag: `result-${roomId.slice(0, 19)}`,
    }));
  }

  return c.json({ ok: true, unranked: true });
});
