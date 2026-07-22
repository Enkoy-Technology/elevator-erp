ALTER TABLE "tenant_branding" ADD COLUMN "default_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_default_locale_check" CHECK ("default_locale" IN ('en', 'am'));
