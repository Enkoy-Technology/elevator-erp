ALTER TABLE "tenants" ADD COLUMN "maintenance_reminder_consent_skipped_last_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "maintenance_reminder_consent_skipped_count" integer;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payment_reminder_consent_skipped_last_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payment_reminder_consent_skipped_count" integer;