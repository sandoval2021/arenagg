-- Phase 7: Global LFG matchmaking and casual match rooms.
-- Casual rooms are intentionally independent from Competition/Stage/Match.

CREATE TYPE "MatchmakingQueueStatus" AS ENUM ('ACTIVE', 'IN_GAME');
CREATE TYPE "MatchmakingChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELED');
CREATE TYPE "CasualMatchMode" AS ENUM ('CASUAL', 'RANKED');
CREATE TYPE "CasualMatchRoomStatus" AS ENUM ('OPEN', 'AWAITING_CONFIRMATION', 'FINISHED', 'CANCELED');

CREATE TABLE "MatchmakingQueue" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "platform" VARCHAR(24) NOT NULL,
  "status" "MatchmakingQueueStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchmakingQueue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchmakingQueue_platform_check" CHECK ("platform" IN ('PS4', 'XBOX_ONE', 'PS5', 'XBOX_SERIES', 'PC'))
);

CREATE UNIQUE INDEX "MatchmakingQueue_userId_key"
  ON "MatchmakingQueue"("userId");
CREATE INDEX "MatchmakingQueue_status_expiresAt_idx"
  ON "MatchmakingQueue"("status", "expiresAt" DESC);
CREATE INDEX "MatchmakingQueue_platform_status_expiresAt_idx"
  ON "MatchmakingQueue"("platform", "status", "expiresAt" DESC);

ALTER TABLE "MatchmakingQueue"
  ADD CONSTRAINT "MatchmakingQueue_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MatchmakingChallenge" (
  "id" UUID NOT NULL,
  "challengerId" UUID NOT NULL,
  "challengedId" UUID NOT NULL,
  "challengerPlatform" VARCHAR(24) NOT NULL,
  "challengedPlatform" VARCHAR(24) NOT NULL,
  "mode" "CasualMatchMode" NOT NULL DEFAULT 'CASUAL',
  "status" "MatchmakingChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchmakingChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchmakingChallenge_not_self_check" CHECK ("challengerId" <> "challengedId"),
  CONSTRAINT "MatchmakingChallenge_challenger_platform_check" CHECK ("challengerPlatform" IN ('PS4', 'XBOX_ONE', 'PS5', 'XBOX_SERIES', 'PC')),
  CONSTRAINT "MatchmakingChallenge_challenged_platform_check" CHECK ("challengedPlatform" IN ('PS4', 'XBOX_ONE', 'PS5', 'XBOX_SERIES', 'PC'))
);

CREATE INDEX "MatchmakingChallenge_challengedId_status_expiresAt_idx"
  ON "MatchmakingChallenge"("challengedId", "status", "expiresAt" DESC);
CREATE INDEX "MatchmakingChallenge_challengerId_status_createdAt_idx"
  ON "MatchmakingChallenge"("challengerId", "status", "createdAt" DESC);

ALTER TABLE "MatchmakingChallenge"
  ADD CONSTRAINT "MatchmakingChallenge_challengerId_fkey"
  FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchmakingChallenge"
  ADD CONSTRAINT "MatchmakingChallenge_challengedId_fkey"
  FOREIGN KEY ("challengedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CasualMatchRoom" (
  "id" UUID NOT NULL,
  "challengeId" UUID NOT NULL,
  "challengerId" UUID NOT NULL,
  "challengedId" UUID NOT NULL,
  "challengerPlatform" VARCHAR(24) NOT NULL,
  "challengedPlatform" VARCHAR(24) NOT NULL,
  "mode" "CasualMatchMode" NOT NULL DEFAULT 'CASUAL',
  "status" "CasualMatchRoomStatus" NOT NULL DEFAULT 'OPEN',
  "challengerHandle" VARCHAR(40),
  "challengedHandle" VARCHAR(40),
  "challengerScore" INTEGER,
  "challengedScore" INTEGER,
  "scoreSubmittedById" UUID,
  "scoreConfirmedById" UUID,
  "challengerMmrDelta" INTEGER,
  "challengedMmrDelta" INTEGER,
  "mmrAppliedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CasualMatchRoom_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CasualMatchRoom_not_self_check" CHECK ("challengerId" <> "challengedId"),
  CONSTRAINT "CasualMatchRoom_challenger_score_check" CHECK ("challengerScore" IS NULL OR "challengerScore" BETWEEN 0 AND 99),
  CONSTRAINT "CasualMatchRoom_challenged_score_check" CHECK ("challengedScore" IS NULL OR "challengedScore" BETWEEN 0 AND 99)
);

CREATE UNIQUE INDEX "CasualMatchRoom_challengeId_key"
  ON "CasualMatchRoom"("challengeId");
CREATE INDEX "CasualMatchRoom_challengerId_status_updatedAt_idx"
  ON "CasualMatchRoom"("challengerId", "status", "updatedAt" DESC);
CREATE INDEX "CasualMatchRoom_challengedId_status_updatedAt_idx"
  ON "CasualMatchRoom"("challengedId", "status", "updatedAt" DESC);

ALTER TABLE "CasualMatchRoom"
  ADD CONSTRAINT "CasualMatchRoom_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "MatchmakingChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasualMatchRoom"
  ADD CONSTRAINT "CasualMatchRoom_challengerId_fkey"
  FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasualMatchRoom"
  ADD CONSTRAINT "CasualMatchRoom_challengedId_fkey"
  FOREIGN KEY ("challengedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- These tables are served only through the authenticated Hono Worker / Prisma.
-- Keep direct Supabase Data API access fail-closed.
ALTER TABLE "MatchmakingQueue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchmakingChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CasualMatchRoom" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MatchmakingQueue" FROM anon, authenticated;
REVOKE ALL ON TABLE "MatchmakingChallenge" FROM anon, authenticated;
REVOKE ALL ON TABLE "CasualMatchRoom" FROM anon, authenticated;
