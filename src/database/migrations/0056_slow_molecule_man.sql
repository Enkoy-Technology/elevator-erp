ALTER TABLE "customers" ADD COLUMN "sms_consent_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "maintenance_reminder_invalid_phone_skipped_count" integer;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payment_reminder_invalid_phone_skipped_count" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sms_consent_revoked_at" timestamp with time zone;