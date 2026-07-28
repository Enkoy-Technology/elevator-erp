-- Lean scope: drop two tables the MVP does not use.
--
-- customer_fingerprints backed the weighted Soundex/geohash duplicate scorer.
-- Replaced by an advisory look-alike query straight off `customers` (name
-- contains + trailing 9 phone digits) — no shadow index to keep in sync.
--
-- permissions backed a per-user grant system that was never read: the JWT
-- claim was always empty and RolesGuard only ever checked the role enum.
-- Roles alone cover Shining Star's access control.

DROP TABLE IF EXISTS customer_fingerprints;--> statement-breakpoint
DROP TABLE IF EXISTS permissions;--> statement-breakpoint

-- Drop the CUSTOM recurrence. There is no custom_interval_days column to
-- drive it, so logging a visit on a CUSTOM contract left next_service_at
-- frozen at its old value forever. Postgres cannot remove an enum value in
-- place, so swap the type; any legacy CUSTOM row becomes MONTHLY.
ALTER TYPE "public"."maintenance_recurrence" RENAME TO "maintenance_recurrence_old";--> statement-breakpoint
CREATE TYPE "public"."maintenance_recurrence" AS ENUM('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL');--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ALTER COLUMN "recurrence" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "maintenance_contracts"
  ALTER COLUMN "recurrence" TYPE "public"."maintenance_recurrence"
  USING (
    CASE WHEN "recurrence"::text = 'CUSTOM' THEN 'MONTHLY' ELSE "recurrence"::text END
  )::"public"."maintenance_recurrence";--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ALTER COLUMN "recurrence" SET DEFAULT 'MONTHLY';--> statement-breakpoint
DROP TYPE "public"."maintenance_recurrence_old";
