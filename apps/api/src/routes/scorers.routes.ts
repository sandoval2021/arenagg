import { Hono } from 'hono';
import type { Env } from '../types/env';

export const scorers = new Hono<Env>();

type TopScorerDbRow = {
  playerKey: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  goals: number;
};

scorers.get('/:id/top-scorers', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');

  const competition = await db.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    select: { id: true },
  });

  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  // Aggregate in PostgreSQL instead of materializing every goal event in the
  // Worker. The CTE also fail-closes any historical scorer set whose sum is
  // greater than the final stored score for that side of the match.
  const rows = await db.$queryRaw<TopScorerDbRow[]>`
    WITH valid_team_match AS (
      SELECT
        ms."matchId",
        ms."teamId"
      FROM "MatchScorer" ms
      INNER JOIN "Match" m ON m."id" = ms."matchId"
      WHERE
        m."competitionId" = CAST(${competitionId} AS UUID)
        AND m."status" = 'FINISHED'
      GROUP BY
        ms."matchId",
        ms."teamId",
        m."homeTeamId",
        m."awayTeamId",
        m."homeScore",
        m."awayScore"
      HAVING SUM(ms."goals") <= CASE
        WHEN ms."teamId" = m."homeTeamId" THEN m."homeScore"
        WHEN ms."teamId" = m."awayTeamId" THEN m."awayScore"
        ELSE NULL
      END
    )
    SELECT
      ms."playerKey" AS "playerKey",
      MIN(ms."playerName") AS "playerName",
      ms."teamId" AS "teamId",
      t."name" AS "teamName",
      t."logoUrl" AS "teamLogoUrl",
      SUM(ms."goals")::INTEGER AS "goals"
    FROM "MatchScorer" ms
    INNER JOIN valid_team_match valid
      ON valid."matchId" = ms."matchId" AND valid."teamId" = ms."teamId"
    INNER JOIN "Team" t ON t."id" = ms."teamId"
    GROUP BY ms."playerKey", ms."teamId", t."name", t."logoUrl"
    ORDER BY "goals" DESC, "playerName" ASC
    LIMIT 100
  `;

  return c.json(
    rows.map((row, index) => ({
      position: index + 1,
      playerName: row.playerName,
      teamId: row.teamId,
      teamName: row.teamName,
      teamLogoUrl: row.teamLogoUrl,
      goals: row.goals,
    })),
  );
});
