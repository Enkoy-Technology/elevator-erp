ALTER TABLE "proformas" ADD COLUMN "reference_code" text;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "delivery_days" integer;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "warranty_parts_months" integer;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "warranty_free_service_months" integer;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "validity_days" integer;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "payment_terms" jsonb;