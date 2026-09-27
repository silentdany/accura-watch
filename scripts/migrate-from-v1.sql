-- One-time migration from the v1 schema (Site.config JSON + MetricSnapshot).
-- Keeps existing sites and their Sentry / Search Console mappings.
--
--   psql "$DATABASE_URL" -f scripts/migrate-from-v1.sql
--   npx prisma db push --accept-data-loss   # drops Site.config and MetricSnapshot
--
-- Safe to re-run.

ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "domain" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "gscProperty" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "posthogProjectId" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "posthogHost" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "sentryProject" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;

-- domain = hostname of url, without www.
UPDATE "Site"
SET "domain" = regexp_replace(lower(substring("url" from '^[a-zA-Z]+://([^/:?#]+)')), '^www\.', '')
WHERE "domain" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Site' AND column_name = 'config') THEN
    UPDATE "Site" SET
      "sentryProject" = COALESCE("sentryProject", NULLIF("config"->>'sentryProject', '')),
      "gscProperty"   = COALESCE("gscProperty", NULLIF(COALESCE("config"->>'gscSiteUrl', "config"->>'gscProperty', "config"->>'gscSite'), ''))
    WHERE "config" IS NOT NULL;
  END IF;
END $$;

-- Duplicate domains would block the unique index: keep the oldest row.
DELETE FROM "Site" s
USING "Site" t
WHERE s."domain" = t."domain" AND s."createdAt" > t."createdAt";

ALTER TABLE "Site" ALTER COLUMN "domain" SET NOT NULL;
