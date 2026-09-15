ALTER TABLE "projects" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'LEAD'::text;--> statement-breakpoint
-- The survey, the spec calculation and the proforma are no longer stages:
-- the specs live on the quotation and the proforma is the approved
-- quotation. Projects parked at those stages fold into the stage on either
-- side; nothing else names a project stage (checked: grep of migrations/).
UPDATE "projects" SET "status" = 'LEAD' WHERE "status" IN ('SITE_SURVEY', 'SPEC_CALCULATION');--> statement-breakpoint
UPDATE "projects" SET "status" = 'QUOTATION' WHERE "status" = 'PROFORMA';--> statement-breakpoint
DROP TYPE "public"."project_status";--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('LEAD', 'QUOTATION', 'CONTRACT', 'EXECUTION', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'LEAD'::"public"."project_status";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" SET DATA TYPE "public"."project_status" USING "status"::"public"."project_status";