CREATE TYPE "public"."maintenance_recurrence" AS ENUM('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."maintenance_contract_status" AS ENUM('ACTIVE', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."breakdown_severity" AS ENUM('EMERGENCY', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."breakdown_status" AS ENUM('OPEN', 'ASSIGNED', 'DONE');--> statement-breakpoint
CREATE TABLE "maintenance_contracts" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"recurrence" "maintenance_recurrence" DEFAULT 'MONTHLY' NOT NULL,
	"status" "maintenance_contract_status" DEFAULT 'ACTIVE' NOT NULL,
	"start_date" date NOT NULL,
	"next_service_at" date NOT NULL,
	"last_service_at" date,
	"assigned_user_id" uuid,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "maintenance_contracts_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "service_visits" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"performed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_visits_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "breakdowns" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" "breakdown_severity" DEFAULT 'MEDIUM' NOT NULL,
	"status" "breakdown_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "breakdowns_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_asset_fk" FOREIGN KEY ("tenant_id","asset_id") REFERENCES "public"."assets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_assigned_fk" FOREIGN KEY ("tenant_id","assigned_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_created_by_fk" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."maintenance_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_performed_by_fk" FOREIGN KEY ("tenant_id","performed_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_asset_fk" FOREIGN KEY ("tenant_id","asset_id") REFERENCES "public"."assets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_assigned_fk" FOREIGN KEY ("tenant_id","assigned_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_created_by_fk" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_contracts_tenant_next_idx" ON "maintenance_contracts" ("tenant_id","next_service_at");--> statement-breakpoint
CREATE INDEX "breakdowns_tenant_status_idx" ON "breakdowns" ("tenant_id","status");
