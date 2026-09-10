-- Temporary private chat for the two players inside a casual Match Room.
CREATE TABLE "CasualRoomChatMessage" (
  "id" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "body" VARCHAR(280) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CasualRoomChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CasualRoomChatMessage_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 280),
  CONSTRAINT "CasualRoomChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CasualMatchRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CasualRoomChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CasualRoomChatMessage_roomId_createdAt_idx"
  ON "CasualRoomChatMessage"("roomId", "createdAt" DESC);
CREATE INDEX "CasualRoomChatMessage_userId_createdAt_idx"
  ON "CasualRoomChatMessage"("userId", "createdAt" DESC);

-- Direct Data API access stays closed; authenticated access is mediated by the Worker.
ALTER TABLE "CasualRoomChatMessage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CasualRoomChatMessage" FROM anon, authenticated;

-- The public image bucket previously inherited/used a 5 MiB application cap.
-- Preserve any larger existing bucket limit and raise smaller/null limits to 10 MiB.
UPDATE storage.buckets
SET file_size_limit = GREATEST(COALESCE(file_size_limit, 10485760), 10485760)
WHERE id = 'escudos';
