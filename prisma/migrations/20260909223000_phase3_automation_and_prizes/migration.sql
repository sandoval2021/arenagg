ALTER TABLE "Competition"
  ADD COLUMN "entryFee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "prizeDistribution" TEXT NOT NULL DEFAULT '60,30,10';

ALTER TABLE "Match"
  ADD COLUMN "homeReady" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "awayReady" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "homeReadyAt" TIMESTAMP(3),
  ADD COLUMN "awayReadyAt" TIMESTAMP(3),
  ADD COLUMN "walkoverWinnerTeamId" UUID,
  ADD COLUMN "walkoverAppliedAt" TIMESTAMP(3),
  ADD COLUMN "walkoverAppliedById" UUID;

ALTER TABLE "Competition"
  ADD CONSTRAINT "Competition_entryFee_nonnegative" CHECK ("entryFee" >= 0);

CREATE INDEX "Match_walkoverAppliedAt_idx" ON "Match"("walkoverAppliedAt");
