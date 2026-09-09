-- Phase 4: native Web Push subscriptions and match highlight clips.
-- Both tables are server-owned. The browser never talks directly to Supabase
-- for these records, so Data API roles stay revoked and RLS is defense-in-depth.

CREATE TABLE "PushSubscription" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_updatedAt_idx" ON "PushSubscription"("userId", "updatedAt");
ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MatchMedia" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'LINK',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchMedia_matchId_url_key" ON "MatchMedia"("matchId", "url");
CREATE INDEX "MatchMedia_matchId_createdAt_idx" ON "MatchMedia"("matchId", "createdAt");
CREATE INDEX "MatchMedia_createdById_createdAt_idx" ON "MatchMedia"("createdById", "createdAt");
ALTER TABLE "MatchMedia"
  ADD CONSTRAINT "MatchMedia_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchMedia"
  ADD CONSTRAINT "MatchMedia_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchMedia" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PushSubscription" FROM anon, authenticated;
REVOKE ALL ON TABLE "MatchMedia" FROM anon, authenticated;
