-- Keep team logo fields unbounded in PostgreSQL. Prisma String already maps to TEXT,
-- but the explicit ALTER repairs any legacy varchar drift in the live database.
ALTER TABLE "Participation"
  ALTER COLUMN "teamLogoUrl" TYPE TEXT USING "teamLogoUrl"::TEXT;

ALTER TABLE "Team"
  ALTER COLUMN "logoUrl" TYPE TEXT USING "logoUrl"::TEXT;

-- Normalize built-in relative icons that may have been saved by older clients.
UPDATE "Participation"
SET "teamLogoUrl" = 'https://chavea.pages.dev' || "teamLogoUrl"
WHERE "teamLogoUrl" LIKE '/icons/teams/%';

UPDATE "Team"
SET "logoUrl" = 'https://chavea.pages.dev' || "logoUrl"
WHERE "logoUrl" LIKE '/icons/teams/%';

-- Remove stale CHECK constraints from earlier/manual schema iterations that
-- referenced the logo columns. They can reject the built-in SVG paths even
-- though the current API intentionally supports them.
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT c.conrelid::regclass AS table_name, c.conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN ('public."Participation"'::regclass, 'public."Team"'::regclass)
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%teamLogoUrl%'
        OR pg_get_constraintdef(c.oid) ILIKE '%logoUrl%'
      )
  LOOP
    RAISE NOTICE 'Dropping legacy team-logo constraint %.%: %', item.table_name, item.conname, item.definition;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', item.table_name, item.conname);
  END LOOP;
END $$;

-- New compatibility rules: uploaded images are HTTPS; built-in icons may also
-- arrive as a safe local /icons/teams/*.svg path from a cached/older frontend.
ALTER TABLE "Participation"
  ADD CONSTRAINT "Participation_teamLogoUrl_safe"
  CHECK (
    "teamLogoUrl" IS NULL
    OR "teamLogoUrl" LIKE 'https://%'
    OR "teamLogoUrl" ~ '^/icons/teams/[a-z0-9-]+\.svg(#[a-z0-9-]+)?$'
  );

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_logoUrl_safe"
  CHECK (
    "logoUrl" IS NULL
    OR "logoUrl" LIKE 'https://%'
    OR "logoUrl" ~ '^/icons/teams/[a-z0-9-]+\.svg(#[a-z0-9-]+)?$'
  );
