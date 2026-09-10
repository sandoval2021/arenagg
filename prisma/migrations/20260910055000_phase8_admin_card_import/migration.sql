DO $$
BEGIN
  CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'USER';

CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- Bootstrap the existing platform owner as an explicit ADMIN. Future admins
-- should be promoted by changing User.role, not by adding more email checks.
UPDATE "User"
SET "role" = 'ADMIN'
WHERE lower(coalesce("email", '')) = lower('sandovaloliveira284@gmail.com');

-- Card artwork is public media. Upload/delete remain privileged operations;
-- the product does not grant anon/authenticated write policies for this bucket.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'cards-assets',
  'cards-assets',
  true,
  NULL,
  ARRAY['image/*']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = true,
  file_size_limit = NULL,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
