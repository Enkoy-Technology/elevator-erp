ALTER TABLE "site_surveys" ADD COLUMN "seen_at" timestamp with time zone;
--> statement-breakpoint
-- Sheets already in the system have been read the old way; only new ones
-- light up. site_surveys has FORCE RLS, so a non-superuser migration role
-- sees zero rows without the bypass GUC.
SELECT set_config('app.admin_bypass', 'on', false);--> statement-breakpoint
UPDATE "site_surveys" SET "seen_at" = "created_at" WHERE "seen_at" IS NULL;--> statement-breakpoint
SELECT set_config('app.admin_bypass', '', false);
