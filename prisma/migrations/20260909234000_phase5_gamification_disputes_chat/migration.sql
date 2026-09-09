-- Phase 5: corporate match integrity + low-cost competition chat.
-- UserBadge already supports the 50-achievement engine without schema growth.

ALTER TABLE "Match"
  ADD COLUMN IF NOT EXISTS "disputeHomeScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "disputeAwayScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "disputeReason" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "disputedById" UUID,
  ADD COLUMN IF NOT EXISTS "disputedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedById" UUID,
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Match_disputedById_fkey'
  ) THEN
    ALTER TABLE "Match"
      ADD CONSTRAINT "Match_disputedById_fkey"
      FOREIGN KEY ("disputedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Match_resolvedById_fkey'
  ) THEN
    ALTER TABLE "Match"
      ADD CONSTRAINT "Match_resolvedById_fkey"
      FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Match_status_disputedAt_idx"
  ON "Match"("status", "disputedAt");

CREATE TABLE IF NOT EXISTS "CompetitionChatMessage" (
  "id" UUID NOT NULL,
  "competitionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitionChatMessage_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 500),
  CONSTRAINT "CompetitionChatMessage_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitionChatMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CompetitionChatMessage_competitionId_createdAt_idx"
  ON "CompetitionChatMessage"("competitionId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CompetitionChatMessage_competitionId_userId_createdAt_idx"
  ON "CompetitionChatMessage"("competitionId", "userId", "createdAt" DESC);

-- Defense in depth: these tables are served only through the authenticated Hono Worker.
ALTER TABLE "CompetitionChatMessage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CompetitionChatMessage" FROM anon, authenticated;
