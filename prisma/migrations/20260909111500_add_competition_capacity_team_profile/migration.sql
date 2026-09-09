ALTER TABLE "Competition"
  ADD COLUMN "maxParticipants" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "Participation"
  ADD COLUMN "teamName" TEXT NOT NULL DEFAULT 'Meu Time',
  ADD COLUMN "teamLogoUrl" TEXT;

UPDATE "Participation" AS p
SET "teamName" = COALESCE(NULLIF(t."name", ''), 'Meu Time'),
    "teamLogoUrl" = t."logoUrl"
FROM "Team" AS t
WHERE t."participationId" = p."id";

ALTER TABLE "Competition"
  ADD CONSTRAINT "Competition_maxParticipants_range"
  CHECK ("maxParticipants" BETWEEN 2 AND 20);
