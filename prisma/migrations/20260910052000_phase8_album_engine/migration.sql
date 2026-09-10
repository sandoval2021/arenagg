-- Phase 8: collectible album foundation + starter catalog.
CREATE TYPE "CardRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');

CREATE TABLE "ChaveaCard" (
  "id" UUID NOT NULL,
  "cardNumber" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "rarity" "CardRarity" NOT NULL,
  "imageUrl" TEXT,
  "boostType" VARCHAR(32) NOT NULL DEFAULT 'NONE',
  "boostValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "albumPage" VARCHAR(100) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChaveaCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChaveaCard_cardNumber_positive" CHECK ("cardNumber" > 0)
);

CREATE TABLE "UserInventoryCard" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "cardId" UUID NOT NULL,
  "isEquipped" BOOLEAN NOT NULL DEFAULT false,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserInventoryCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserStickerPack" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "packType" VARCHAR(32) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserStickerPack_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserStickerPack_quantity_nonnegative" CHECK ("quantity" >= 0)
);

CREATE UNIQUE INDEX "ChaveaCard_cardNumber_key" ON "ChaveaCard"("cardNumber");
CREATE INDEX "ChaveaCard_albumPage_cardNumber_idx" ON "ChaveaCard"("albumPage", "cardNumber");
CREATE INDEX "ChaveaCard_rarity_isActive_idx" ON "ChaveaCard"("rarity", "isActive");
CREATE INDEX "UserInventoryCard_userId_cardId_idx" ON "UserInventoryCard"("userId", "cardId");
CREATE INDEX "UserInventoryCard_userId_isEquipped_idx" ON "UserInventoryCard"("userId", "isEquipped");
CREATE INDEX "UserInventoryCard_cardId_idx" ON "UserInventoryCard"("cardId");
CREATE UNIQUE INDEX "UserStickerPack_userId_packType_key" ON "UserStickerPack"("userId", "packType");
CREATE INDEX "UserStickerPack_userId_quantity_idx" ON "UserStickerPack"("userId", "quantity");

ALTER TABLE "UserInventoryCard"
  ADD CONSTRAINT "UserInventoryCard_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInventoryCard"
  ADD CONSTRAINT "UserInventoryCard_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "ChaveaCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserStickerPack"
  ADD CONSTRAINT "UserStickerPack_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Direct Data API access stays fail-closed; authenticated Worker routes own access.
ALTER TABLE "ChaveaCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserInventoryCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserStickerPack" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ChaveaCard" FROM anon, authenticated;
REVOKE ALL ON TABLE "UserInventoryCard" FROM anon, authenticated;
REVOKE ALL ON TABLE "UserStickerPack" FROM anon, authenticated;

-- 50 generic, copyright-safe starter cards for immediate UI testing.
INSERT INTO "ChaveaCard"
  ("id", "cardNumber", "name", "rarity", "imageUrl", "boostType", "boostValue", "albumPage", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  n,
  'Craque Chavea #' || LPAD(n::text, 3, '0'),
  CASE
    WHEN n <= 40 THEN 'COMMON'::"CardRarity"
    WHEN n <= 47 THEN 'RARE'::"CardRarity"
    WHEN n <= 49 THEN 'EPIC'::"CardRarity"
    ELSE 'LEGENDARY'::"CardRarity"
  END,
  NULL,
  'NONE',
  0,
  CASE
    WHEN n <= 10 THEN 'Lendas'
    WHEN n <= 20 THEN 'Craques'
    WHEN n <= 30 THEN 'Camisa 10'
    WHEN n <= 40 THEN 'Defensores'
    ELSE 'Ídolos'
  END,
  true,
  NOW(),
  NOW()
FROM generate_series(1, 50) AS n
ON CONFLICT ("cardNumber") DO NOTHING;
