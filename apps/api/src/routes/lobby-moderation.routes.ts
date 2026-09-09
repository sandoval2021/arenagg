import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import type { Env } from '../types/env';

export const lobbyModeration = new Hono<Env>();

lobbyModeration.delete('/:id/participants/:participationId', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');
  const participationId = c.req.param('participationId');
  const requestId = crypto.randomUUID();

  try {
    const result = await db.$transaction(async (tx) => {
      const competition = await tx.competition.findUnique({
        where: { id: competitionId },
        select: { id: true, hostId: true, status: true },
      });

      if (!competition) return { ok: false as const, error: 'COMPETITION_NOT_FOUND' as const };
      if (competition.hostId !== user.id) return { ok: false as const, error: 'HOST_ONLY' as const };
      if (!['REGISTRATION', 'READY'].includes(competition.status)) {
        return { ok: false as const, error: 'LOBBY_LOCKED' as const };
      }

      const participation = await tx.participation.findUnique({
        where: { id: participationId },
        select: { id: true, competitionId: true, userId: true },
      });

      if (!participation || participation.competitionId !== competitionId) {
        return { ok: false as const, error: 'PARTICIPANT_NOT_FOUND' as const };
      }
      if (participation.userId === competition.hostId || participation.userId === user.id) {
        return { ok: false as const, error: 'HOST_CANNOT_REMOVE_SELF' as const };
      }

      // Team is 1:1 with Participation and its FK uses ON DELETE CASCADE.
      // Removing the lobby participation therefore removes the linked Team too.
      await tx.participation.delete({ where: { id: participation.id } });

      return { ok: true as const, removedUserId: participation.userId };
    });

    if (!result.ok) {
      const status = result.error === 'COMPETITION_NOT_FOUND' || result.error === 'PARTICIPANT_NOT_FOUND'
        ? 404
        : result.error === 'HOST_ONLY'
          ? 403
          : 409;
      return c.json({ error: result.error, requestId }, status);
    }

    console.info('[lobby.remove-participant] removed', {
      requestId,
      competitionId,
      participationId,
      removedUserId: result.removedUserId,
      hostId: user.id,
    });
    return c.json({ removed: true, requestId }, 200);
  } catch (error) {
    const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    console.error('[lobby.remove-participant] failed', {
      requestId,
      competitionId,
      participationId,
      hostId: user.id,
      prismaCode,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return c.json(
      {
        error: 'PARTICIPANT_REMOVE_FAILED',
        prismaCode,
        requestId,
      },
      500,
    );
  }
});
