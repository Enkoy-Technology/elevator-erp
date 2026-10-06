-- Units on a site survey are whatever the form says — "2" or a word — so the
-- column is text (client, 2026-10-06). Existing counts keep their digits.
ALTER TABLE "site_surveys" ALTER COLUMN "units" SET DATA TYPE text USING "units"::text;
