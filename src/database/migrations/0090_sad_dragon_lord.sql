CREATE TYPE "public"."asset_checklist_mark" AS ENUM('OK', 'MISSING', 'DAMAGED', 'NOT_INCLUDED');--> statement-breakpoint
CREATE TYPE "public"."asset_event_kind" AS ENUM('REGISTERED', 'STATUS', 'CORRECTED', 'SOLD_TO');--> statement-breakpoint
ALTER TYPE "public"."asset_status" ADD VALUE 'ON_ORDER' BEFORE 'ACTIVE';--> statement-breakpoint
ALTER TYPE "public"."asset_status" ADD VALUE 'CHECKING' BEFORE 'ACTIVE';--> statement-breakpoint
ALTER TYPE "public"."asset_status" ADD VALUE 'IN_STORE' BEFORE 'ACTIVE';--> statement-breakpoint
ALTER TYPE "public"."asset_status" ADD VALUE 'AT_SITE' BEFORE 'ACTIVE';--> statement-breakpoint
CREATE TABLE "asset_checklist_items" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"case_no" integer NOT NULL,
	"box_name" text NOT NULL,
	"item_no" text NOT NULL,
	"name" text NOT NULL,
	"factory_name" text NOT NULL,
	"specification" text,
	"unit" text,
	"quantity" text,
	"position" integer NOT NULL,
	"mark" "asset_checklist_mark",
	"note" text,
	"checked_by_user_id" uuid,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_checklist_items_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "asset_events" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" "asset_event_kind" NOT NULL,
	"from_status" "asset_status",
	"to_status" "asset_status",
	"customer_id" uuid,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_events_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_checklist_items" ADD CONSTRAINT "asset_checklist_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_checklist_items" ADD CONSTRAINT "asset_checklist_items_asset_fk" FOREIGN KEY ("tenant_id","asset_id") REFERENCES "public"."assets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_checklist_items" ADD CONSTRAINT "asset_checklist_items_checked_by_fk" FOREIGN KEY ("tenant_id","checked_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_asset_fk" FOREIGN KEY ("tenant_id","asset_id") REFERENCES "public"."assets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_created_by_fk" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_checklist_items_tenant_asset_idx" ON "asset_checklist_items" USING btree ("tenant_id","asset_id","position");--> statement-breakpoint
CREATE INDEX "asset_events_tenant_asset_idx" ON "asset_events" USING btree ("tenant_id","asset_id","created_at");--> statement-breakpoint
-- Tenant isolation, same shape as every other tenant table (see 0064).
ALTER TABLE asset_checklist_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE asset_checklist_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON asset_checklist_items
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON asset_checklist_items
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
ALTER TABLE asset_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE asset_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON asset_events
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON asset_events
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');
