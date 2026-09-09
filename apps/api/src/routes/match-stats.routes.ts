import { Hono } from 'hono';
import type { Env } from '../types/env';

export const matchStats = new Hono<Env>();

matchStats.get('/competition/:competitionId', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('competitionId');

  const competition = await db.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    select: { id: true, hostId: true },
  });

  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const rows = await db.matchStats.findMany({
    where: { match: { competitionId } },
    include: {
      match: {
        select: {
          homeTeam: { select: { participation: { select: { userId: true } } } },
          awayTeam: { select: { participation: { select: { userId: true } } } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return c.json(
    rows.map(({ match, ...stats }) => {
      const isHost = competition.hostId === user.id;
      const isPlayer =
        match.homeTeam?.participation.userId === user.id ||
        match.awayTeam?.participation.userId === user.id;
      const submittedByMe = stats.submittedById === user.id;
      const pendingForOpponent =
        stats.statsStatus === 'PENDING_APPROVAL' && isPlayer && !submittedByMe;

      return {
        ...stats,
        submittedByMe,
        canApprove:
          (isHost && ['PENDING_APPROVAL', 'DISPUTED'].includes(stats.statsStatus)) || pendingForOpponent,
        canDispute: !isHost && pendingForOpponent,
      };
    }),
  );
});
