-- Phase 2: global MMR and normalized achievement awards.
ALTER TABLE "UserProfile"
ADD COLUMN "mmr" INTEGER NOT NULL DEFAULT 1500;

CREATE TABLE "UserBadge" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "badgeCode" TEXT NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserBadge"
ADD CONSTRAINT "UserBadge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UserBadge_userId_badgeCode_key" ON "UserBadge"("userId", "badgeCode");
CREATE INDEX "UserBadge_userId_awardedAt_idx" ON "UserBadge"("userId", "awardedAt");
CREATE INDEX "UserBadge_badgeCode_idx" ON "UserBadge"("badgeCode");

-- Defense-in-depth: this table is internal to the Hono/Prisma API and must not
-- become an accidental PostgREST surface in Supabase.
ALTER TABLE "UserBadge" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "UserBadge" FROM anon, authenticated;

-- Backfill achievements from canonical historical match data. This keeps the
-- Trophy Room correct for matches completed before Phase 2 was deployed.
INSERT INTO "UserBadge" ("id", "userId", "badgeCode", "awardedAt")
SELECT gen_random_uuid(), p."userId", 'FIRST_MATCH', COALESCE(MIN(m."profileAppliedAt"), CURRENT_TIMESTAMP)
FROM "Match" m
JOIN "Team" t ON t."id" IN (m."homeTeamId", m."awayTeamId")
JOIN "Participation" p ON p."id" = t."participationId"
WHERE m."status" = 'FINISHED'
  AND m."homeScore" IS NOT NULL
  AND m."awayScore" IS NOT NULL
GROUP BY p."userId"
ON CONFLICT ("userId", "badgeCode") DO NOTHING;

INSERT INTO "UserBadge" ("id", "userId", "badgeCode", "awardedAt")
SELECT gen_random_uuid(), p."userId", 'RELENTLESS_SCORER', COALESCE(MIN(m."profileAppliedAt"), CURRENT_TIMESTAMP)
FROM "Match" m
JOIN "Team" t ON (
  (t."id" = m."homeTeamId" AND m."homeScore" >= 5)
  OR (t."id" = m."awayTeamId" AND m."awayScore" >= 5)
)
JOIN "Participation" p ON p."id" = t."participationId"
WHERE m."status" = 'FINISHED'
GROUP BY p."userId"
ON CONFLICT ("userId", "badgeCode") DO NOTHING;

INSERT INTO "UserBadge" ("id", "userId", "badgeCode", "awardedAt")
SELECT gen_random_uuid(), p."userId", 'WALL', COALESCE(MIN(m."profileAppliedAt"), CURRENT_TIMESTAMP)
FROM "Match" m
JOIN "Team" t ON (
  (
    t."id" = m."homeTeamId"
    AND m."awayScore" = 0
    AND (
      m."homeScore" > m."awayScore"
      OR (
        m."homeScore" = m."awayScore"
        AND m."homePenaltyScore" IS NOT NULL
        AND m."awayPenaltyScore" IS NOT NULL
        AND m."homePenaltyScore" > m."awayPenaltyScore"
      )
    )
  )
  OR (
    t."id" = m."awayTeamId"
    AND m."homeScore" = 0
    AND (
      m."awayScore" > m."homeScore"
      OR (
        m."homeScore" = m."awayScore"
        AND m."homePenaltyScore" IS NOT NULL
        AND m."awayPenaltyScore" IS NOT NULL
        AND m."awayPenaltyScore" > m."homePenaltyScore"
      )
    )
  )
)
JOIN "Participation" p ON p."id" = t."participationId"
WHERE m."status" = 'FINISHED'
GROUP BY p."userId"
ON CONFLICT ("userId", "badgeCode") DO NOTHING;
