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

  // The Worker delegates the ranking to PostgreSQL. First, discard any
  // historical scorer set that would exceed the final score for that side of
  // a FINISHED match. Then aggregate globally by normalized playerKey across
  // the whole competition, exactly matching the public "artilharia" concept.
  // If the same player name appears for more than one team, the UI shows the
  // team for which that scorer contributed the most goals while the total
  // still includes all valid goals in the competition.
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
    ),
    scorer_team_totals AS (
      SELECT
        ms."playerKey" AS "playerKey",
        ms."teamId" AS "teamId",
        SUM(ms."goals")::INTEGER AS "teamGoals",
        MAX(ms."createdAt") AS "lastGoalAt"
      FROM "MatchScorer" ms
      INNER JOIN valid_team_match valid
        ON valid."matchId" = ms."matchId" AND valid."teamId" = ms."teamId"
      GROUP BY ms."playerKey", ms."teamId"
    ),
    representative_team AS (
      SELECT
        ranked."playerKey",
        ranked."teamId"
      FROM (
        SELECT
          totals.*,
          ROW_NUMBER() OVER (
            PARTITION BY totals."playerKey"
            ORDER BY totals."teamGoals" DESC, totals."lastGoalAt" DESC, totals."teamId"
          ) AS rn
        FROM scorer_team_totals totals
      ) ranked
      WHERE ranked.rn = 1
    ),
    scorer_totals AS (
      SELECT
        ms."playerKey" AS "playerKey",
        (ARRAY_AGG(ms."playerName" ORDER BY ms."createdAt" DESC))[1] AS "playerName",
        SUM(ms."goals")::INTEGER AS "goals"
      FROM "MatchScorer" ms
      INNER JOIN valid_team_match valid
        ON valid."matchId" = ms."matchId" AND valid."teamId" = ms."teamId"
      GROUP BY ms."playerKey"
    )
    SELECT
      totals."playerKey" AS "playerKey",
      totals."playerName" AS "playerName",
      team."id" AS "teamId",
      team."name" AS "teamName",
      team."logoUrl" AS "teamLogoUrl",
      totals."goals" AS "goals"
    FROM scorer_totals totals
    INNER JOIN representative_team representative
      ON representative."playerKey" = totals."playerKey"
    INNER JOIN "Team" team
      ON team."id" = representative."teamId"
    ORDER BY totals."goals" DESC, totals."playerName" ASC
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
