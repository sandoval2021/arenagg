ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "supabaseAuthId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "User_supabaseAuthId_key"
ON "User"("supabaseAuthId")
WHERE "supabaseAuthId" IS NOT NULL;
