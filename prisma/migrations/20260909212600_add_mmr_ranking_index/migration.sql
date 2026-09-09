-- Supports the bounded Top 100 ranking query without a full profile scan.
CREATE INDEX "UserProfile_mmr_totalWins_idx" ON "UserProfile"("mmr", "totalWins");
