CREATE TABLE "product_types" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"base_price_etb" numeric(14, 2) NOT NULL,
	"per_stop_etb" numeric(12, 2) DEFAULT '0' NOT NULL,
	"per_kg_etb" numeric(12, 2) DEFAULT '0' NOT NULL,
	"lift_geometry" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "product_types_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "product_types_tenant_code_uk" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
ALTER TABLE "product_types" ADD CONSTRAINT "product_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Tenant isolation, same shape as every other tenant table (see 0064).
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_types FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON product_types
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON product_types
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');
