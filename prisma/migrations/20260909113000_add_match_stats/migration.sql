CREATE TYPE "MatchStatsStatus" AS ENUM ('NONE', 'PENDING_APPROVAL', 'APPROVED', 'DISPUTED');

CREATE TABLE "MatchStats" (
  "matchId" UUID NOT NULL,
  "statsStatus" "MatchStatsStatus" NOT NULL DEFAULT 'NONE',
  "homePossession" INTEGER NOT NULL,
  "awayPossession" INTEGER NOT NULL,
  "homeShots" INTEGER NOT NULL,
  "awayShots" INTEGER NOT NULL,
  "homeShotsOnGoal" INTEGER NOT NULL,
  "awayShotsOnGoal" INTEGER NOT NULL,
  "homePasses" INTEGER NOT NULL,
  "awayPasses" INTEGER NOT NULL,
  "homeTackles" INTEGER NOT NULL,
  "awayTackles" INTEGER NOT NULL,
  "homeFouls" INTEGER NOT NULL,
  "awayFouls" INTEGER NOT NULL,
  "submittedById" UUID NOT NULL,
  "reviewedById" UUID,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchStats_pkey" PRIMARY KEY ("matchId"),
  CONSTRAINT "MatchStats_possession_range" CHECK (
    "homePossession" BETWEEN 0 AND 100
    AND "awayPossession" BETWEEN 0 AND 100
    AND "homePossession" + "awayPossession" = 100
  ),
  CONSTRAINT "MatchStats_non_negative" CHECK (
    "homeShots" >= 0 AND "awayShots" >= 0
    AND "homeShotsOnGoal" >= 0 AND "awayShotsOnGoal" >= 0
    AND "homePasses" >= 0 AND "awayPasses" >= 0
    AND "homeTackles" >= 0 AND "awayTackles" >= 0
    AND "homeFouls" >= 0 AND "awayFouls" >= 0
  ),
  CONSTRAINT "MatchStats_shots_on_goal_valid" CHECK (
    "homeShotsOnGoal" <= "homeShots"
    AND "awayShotsOnGoal" <= "awayShots"
  )
);

CREATE INDEX "MatchStats_statsStatus_idx" ON "MatchStats"("statsStatus");
CREATE INDEX "MatchStats_submittedById_idx" ON "MatchStats"("submittedById");

ALTER TABLE "MatchStats"
  ADD CONSTRAINT "MatchStats_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchStats"
  ADD CONSTRAINT "MatchStats_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MatchStats"
  ADD CONSTRAINT "MatchStats_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
