ALTER TABLE "Match"
  ADD COLUMN "profileAppliedAt" TIMESTAMP(3);

ALTER TABLE "Competition"
  ADD COLUMN "championshipProfileAppliedAt" TIMESTAMP(3);

CREATE INDEX "Match_profileAppliedAt_idx" ON "Match"("profileAppliedAt");
CREATE INDEX "Competition_championshipProfileAppliedAt_idx" ON "Competition"("championshipProfileAppliedAt");
