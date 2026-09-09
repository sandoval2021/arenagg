-- Extend the competition format without changing existing rows.
ALTER TYPE "CompetitionType" ADD VALUE IF NOT EXISTS 'ENDLESS';

-- Optional discovery metadata for the future social/competition network.
ALTER TABLE "Competition"
  ADD COLUMN "game" TEXT,
  ADD COLUMN "platform" TEXT;

CREATE INDEX "Competition_game_platform_idx"
  ON "Competition"("game", "platform");

-- In ENDLESS competitions, Team keeps identifying the participant while these
-- columns snapshot the club selected for this individual match.
ALTER TABLE "Match"
  ADD COLUMN "homeTeamName" TEXT,
  ADD COLUMN "awayTeamName" TEXT;

-- Aggregated all-time statistics for the future public Player Card / Trophy Room.
CREATE TABLE "UserProfile" (
  "userId" UUID NOT NULL,
  "totalWins" INTEGER NOT NULL DEFAULT 0,
  "totalDraws" INTEGER NOT NULL DEFAULT 0,
  "totalLosses" INTEGER NOT NULL DEFAULT 0,
  "totalGoalsScored" INTEGER NOT NULL DEFAULT 0,
  "totalGoalsConceded" INTEGER NOT NULL DEFAULT 0,
  "championshipsWon" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserProfile_nonnegative_stats_check" CHECK (
    "totalWins" >= 0 AND
    "totalDraws" >= 0 AND
    "totalLosses" >= 0 AND
    "totalGoalsScored" >= 0 AND
    "totalGoalsConceded" >= 0 AND
    "championshipsWon" >= 0
  )
);

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
