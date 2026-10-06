-- Site survey measurements move from centimetres to millimetres, like every
-- other measurement in the system (client, 2026-10-06). Existing figures were
-- recorded in centimetres, so they are multiplied up, not relabelled.
ALTER TABLE "site_surveys" RENAME COLUMN "shaft_width_cm" TO "shaft_width_mm";--> statement-breakpoint
ALTER TABLE "site_surveys" RENAME COLUMN "shaft_depth_cm" TO "shaft_depth_mm";--> statement-breakpoint
ALTER TABLE "site_surveys" RENAME COLUMN "overhead_cm" TO "overhead_mm";--> statement-breakpoint
UPDATE "site_surveys" SET "shaft_width_mm" = "shaft_width_mm" * 10, "shaft_depth_mm" = "shaft_depth_mm" * 10, "overhead_mm" = "overhead_mm" * 10;
