ALTER TABLE "assets" ADD COLUMN "spec_summary" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "delivery_working_days" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "installation_working_days" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "delay_penalty_percent_per_day" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "delay_penalty_cap_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "advance_guarantee_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "free_maintenance_months" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "dispute_forum" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tin_number" text;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD COLUMN "monthly_fee_etb" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD COLUMN "fee_includes_vat" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD COLUMN "term_months" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD COLUMN "auto_renews" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD COLUMN "notice_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD COLUMN "cure_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD COLUMN "scope_of_work" text;