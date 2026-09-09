CREATE TABLE "DefaultShield" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DefaultShield_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DefaultShield_storagePath_key" ON "DefaultShield"("storagePath");
CREATE INDEX "DefaultShield_isActive_sortOrder_idx" ON "DefaultShield"("isActive", "sortOrder");

ALTER TABLE "DefaultShield"
  ADD CONSTRAINT "DefaultShield_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
