-- Phase 6: Fair Play reputation + explicit group-stage format.
-- Existing Competition.type/Stage/Group/GroupTeam are preserved for backwards compatibility.

CREATE TYPE "CompetitionFormat" AS ENUM ('KNOCKOUT', 'GROUP_STAGE');
CREATE TYPE "ReputationTag" AS ENUM ('RAGE_QUITTER', 'TOXIC', 'FAIR_PLAY');

ALTER TABLE "Competition"
  ADD COLUMN "format" "CompetitionFormat" NOT NULL DEFAULT 'KNOCKOUT';

UPDATE "Competition"
SET "format" = 'GROUP_STAGE'
WHERE "type" = 'GROUPS_KNOCKOUT';

ALTER TABLE "UserProfile"
  ADD COLUMN "reputationAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "reputationCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "UserReview" (
  "id" UUID NOT NULL,
  "reviewerId" UUID NOT NULL,
  "reviewedId" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "stars" INTEGER NOT NULL,
  "tags" "ReputationTag"[] NOT NULL DEFAULT ARRAY[]::"ReputationTag"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserReview_stars_check" CHECK ("stars" BETWEEN 1 AND 5),
  CONSTRAINT "UserReview_not_self_check" CHECK ("reviewerId" <> "reviewedId")
);

CREATE UNIQUE INDEX "UserReview_matchId_reviewerId_key"
  ON "UserReview"("matchId", "reviewerId");
CREATE INDEX "UserReview_reviewedId_createdAt_idx"
  ON "UserReview"("reviewedId", "createdAt" DESC);
CREATE INDEX "UserReview_reviewedId_stars_idx"
  ON "UserReview"("reviewedId", "stars");

ALTER TABLE "UserReview"
  ADD CONSTRAINT "UserReview_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserReview"
  ADD CONSTRAINT "UserReview_reviewedId_fkey"
  FOREIGN KEY ("reviewedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserReview"
  ADD CONSTRAINT "UserReview_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GroupStanding" (
  "id" UUID NOT NULL,
  "groupId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "played" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "draws" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "goalsFor" INTEGER NOT NULL DEFAULT 0,
  "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
  "goalDifference" INTEGER NOT NULL DEFAULT 0,
  "points" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupStanding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupStanding_groupId_teamId_key"
  ON "GroupStanding"("groupId", "teamId");
CREATE INDEX "GroupStanding_groupId_points_goalDifference_goalsFor_idx"
  ON "GroupStanding"("groupId", "points", "goalDifference", "goalsFor");
CREATE INDEX "GroupStanding_teamId_idx"
  ON "GroupStanding"("teamId");
CREATE INDEX "Competition_format_status_idx"
  ON "Competition"("format", "status");
CREATE INDEX "UserProfile_reputationAverage_reputationCount_idx"
  ON "UserProfile"("reputationAverage", "reputationCount");

ALTER TABLE "GroupStanding"
  ADD CONSTRAINT "GroupStanding_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupStanding"
  ADD CONSTRAINT "GroupStanding_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- These tables are accessed only through the authenticated Hono Worker / Prisma.
-- Keep direct Supabase Data API access fail-closed.
ALTER TABLE "UserReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupStanding" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "UserReview" FROM anon, authenticated;
REVOKE ALL ON TABLE "GroupStanding" FROM anon, authenticated;
