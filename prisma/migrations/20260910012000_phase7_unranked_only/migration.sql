-- Phase 7 product hardening: every LFG room is an unranked friendly.
-- Preserve the existing enum/columns for backwards-compatible Prisma reads,
-- but make RANKED impossible at the database boundary.

-- Compensate any direct MMR delta applied by the short-lived ranked LFG option.
-- The migration is applied exactly once, so this correction is idempotent via migration history.
UPDATE "UserProfile" AS profile
SET "mmr" = profile."mmr" - room."challengerMmrDelta"
FROM "CasualMatchRoom" AS room
WHERE room."challengerId" = profile."userId"
  AND room."mmrAppliedAt" IS NOT NULL
  AND room."challengerMmrDelta" IS NOT NULL;

UPDATE "UserProfile" AS profile
SET "mmr" = profile."mmr" - room."challengedMmrDelta"
FROM "CasualMatchRoom" AS room
WHERE room."challengedId" = profile."userId"
  AND room."mmrAppliedAt" IS NOT NULL
  AND room."challengedMmrDelta" IS NOT NULL;

UPDATE "MatchmakingChallenge"
SET "mode" = 'CASUAL'
WHERE "mode" <> 'CASUAL';

UPDATE "CasualMatchRoom"
SET
  "mode" = 'CASUAL',
  "challengerMmrDelta" = NULL,
  "challengedMmrDelta" = NULL,
  "mmrAppliedAt" = NULL
WHERE "mode" <> 'CASUAL'
   OR "challengerMmrDelta" IS NOT NULL
   OR "challengedMmrDelta" IS NOT NULL
   OR "mmrAppliedAt" IS NOT NULL;

ALTER TABLE "MatchmakingChallenge"
  ADD CONSTRAINT "MatchmakingChallenge_casual_only_check"
  CHECK ("mode" = 'CASUAL');

ALTER TABLE "CasualMatchRoom"
  ADD CONSTRAINT "CasualMatchRoom_casual_only_check"
  CHECK (
    "mode" = 'CASUAL'
    AND "challengerMmrDelta" IS NULL
    AND "challengedMmrDelta" IS NULL
    AND "mmrAppliedAt" IS NULL
  );
