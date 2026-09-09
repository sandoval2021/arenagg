-- Supports Top 100 crest lookup: latest active participation per ranked user.
CREATE INDEX "Participation_userId_status_joinedAt_idx"
ON "Participation"("userId", "status", "joinedAt");
