CREATE TYPE "public"."customer_type" AS ENUM('RESIDENTIAL', 'COMMERCIAL', 'GOVERNMENT');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('LEAD', 'SITE_SURVEY', 'SPEC_CALCULATION', 'QUOTATION', 'PROFORMA', 'CONTRACT', 'EXECUTION', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "customers" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"email" text,
	"phone" text,
	"alternate_phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"region" text,
	"country" text DEFAULT 'ET' NOT NULL,
	"building_name" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"customer_type" "customer_type" DEFAULT 'COMMERCIAL' NOT NULL,
	"credit_limit_etb" numeric(14, 2) DEFAULT '0' NOT NULL,
	"outstanding_balance_etb" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_terms_days" numeric(5, 0) DEFAULT '30' NOT NULL,
	"tags" text[],
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "customers_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fk" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;