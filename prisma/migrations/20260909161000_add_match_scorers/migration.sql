CREATE TABLE "MatchScorer" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "playerName" TEXT NOT NULL,
  "playerKey" TEXT NOT NULL,
  "goals" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchScorer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchScorer_goals_positive" CHECK ("goals" BETWEEN 1 AND 99),
  CONSTRAINT "MatchScorer_player_name_valid" CHECK (
    char_length(btrim("playerName")) BETWEEN 2 AND 60
    AND char_length(btrim("playerKey")) BETWEEN 1 AND 80
  )
);

CREATE UNIQUE INDEX "MatchScorer_matchId_teamId_playerKey_key"
  ON "MatchScorer"("matchId", "teamId", "playerKey");

CREATE INDEX "MatchScorer_matchId_teamId_idx"
  ON "MatchScorer"("matchId", "teamId");

CREATE INDEX "MatchScorer_teamId_playerKey_idx"
  ON "MatchScorer"("teamId", "playerKey");

ALTER TABLE "MatchScorer"
  ADD CONSTRAINT "MatchScorer_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchScorer"
  ADD CONSTRAINT "MatchScorer_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
