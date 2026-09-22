CREATE TABLE "site_surveys" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"surveyed_by_user_id" uuid,
	"survey_date" text NOT NULL,
	"project_name" text NOT NULL,
	"address" text,
	"contact_name" text,
	"contact_phone" text,
	"shaft_width_cm" integer,
	"shaft_depth_cm" integer,
	"floors" text,
	"overhead_cm" integer,
	"machine_room" text,
	"units" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_surveys_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_surveys_tenant_created_idx" ON "site_surveys" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "site_surveys_tenant_surveyor_idx" ON "site_surveys" USING btree ("tenant_id","surveyed_by_user_id");--> statement-breakpoint
-- Tenant isolation, same shape as every other tenant table (see 0064).
ALTER TABLE site_surveys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE site_surveys FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON site_surveys
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON site_surveys
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');
