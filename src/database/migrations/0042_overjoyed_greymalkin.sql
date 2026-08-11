CREATE TYPE "public"."supply_kind" AS ENUM('GOODS', 'SERVICES');--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "supply_kind" "supply_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "net_amount_etb" numeric(14, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "vat_etb" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reverse_reason" text;