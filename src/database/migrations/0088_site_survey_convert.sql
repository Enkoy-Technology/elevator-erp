ALTER TABLE "site_surveys" ADD COLUMN "product_type" text;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD COLUMN "capacity_kg" integer;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;