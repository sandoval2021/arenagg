-- Cloudflare D1 SQLite: the original Prisma-generated DEFAULT [] was
-- interpreted as the empty string instead of JSON array "[]".
-- Owner accounts seeded without an explicit consoles value therefore
-- cannot be loaded through Prisma's JSON decoder.
--
-- Repair only malformed empty-string defaults. Never modify valid JSON
-- arrays, authentication data, scores or any championship records.
UPDATE "UserProfile"
SET "consoles" = '[]'
WHERE typeof("consoles") = 'text' AND "consoles" = '';

UPDATE "UserReview"
SET "tags" = '[]'
WHERE typeof("tags") = 'text' AND "tags" = '';

-- SQLite cannot ALTER COLUMN DEFAULT without a table rebuild. Triggers
-- make omitted optional JSON fields safe for existing D1 databases until
-- a fully tested table rebuild is performed.
CREATE TRIGGER IF NOT EXISTS "UserProfile_consoles_default_guard"
AFTER INSERT ON "UserProfile"
WHEN typeof(NEW."consoles") = 'text' AND NEW."consoles" = ''
BEGIN
  UPDATE "UserProfile" SET "consoles" = '[]'
  WHERE "userId" = NEW."userId";
END;

CREATE TRIGGER IF NOT EXISTS "UserReview_tags_default_guard"
AFTER INSERT ON "UserReview"
WHEN typeof(NEW."tags") = 'text' AND NEW."tags" = ''
BEGIN
  UPDATE "UserReview" SET "tags" = '[]'
  WHERE "id" = NEW."id";
END;
