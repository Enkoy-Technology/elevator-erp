-- Every part now starts ticked as arrived and is either ticked or unticked, so
-- a blank row is one nobody unticked, and the two older marks read as unticked.
-- asset_checklist_items has FORCE RLS, so a non-superuser migration role sees
-- zero rows without the bypass GUC.
SELECT set_config('app.admin_bypass', 'on', false);--> statement-breakpoint
UPDATE asset_checklist_items SET mark = 'OK' WHERE mark IS NULL;--> statement-breakpoint
UPDATE asset_checklist_items SET mark = 'MISSING' WHERE mark IN ('DAMAGED', 'NOT_INCLUDED');--> statement-breakpoint
SELECT set_config('app.admin_bypass', '', false);--> statement-breakpoint
ALTER TABLE "asset_checklist_items" ALTER COLUMN "mark" SET NOT NULL;
