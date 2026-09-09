CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

ALTER TABLE "UserProfile"
  ADD COLUMN "consoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "Friendship" (
  "id" UUID NOT NULL,
  "requesterId" UUID NOT NULL,
  "addresseeId" UUID NOT NULL,
  "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Friendship_no_self" CHECK ("requesterId" <> "addresseeId")
);

CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key"
  ON "Friendship"("requesterId", "addresseeId");

-- Friendship is conceptually undirected. This expression index prevents the
-- same pair from being persisted twice in opposite directions.
CREATE UNIQUE INDEX "Friendship_unique_pair"
  ON "Friendship"(
    LEAST("requesterId", "addresseeId"),
    GREATEST("requesterId", "addresseeId")
  );

CREATE INDEX "Friendship_requesterId_status_idx"
  ON "Friendship"("requesterId", "status");

CREATE INDEX "Friendship_addresseeId_status_idx"
  ON "Friendship"("addresseeId", "status");

ALTER TABLE "Friendship"
  ADD CONSTRAINT "Friendship_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Friendship"
  ADD CONSTRAINT "Friendship_addresseeId_fkey"
  FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
