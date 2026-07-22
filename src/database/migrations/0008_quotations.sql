CREATE TYPE "public"."quote_status" AS ENUM('DRAFT', 'APPROVED', 'REJECTED', 'PROFORMA', 'CONTRACT', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "quotations" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"quote_number" text NOT NULL,
	"status" "quote_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"calc_input" jsonb NOT NULL,
	"technical_spec" jsonb NOT NULL,
	"pricing_breakdown" jsonb NOT NULL,
	"margin_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"subtotal_etb" numeric(14, 2) NOT NULL,
	"margin_amount_etb" numeric(14, 2) NOT NULL,
	"tax_amount_etb" numeric(14, 2) NOT NULL,
	"total_price_etb" numeric(14, 2) NOT NULL,
	"valid_until" timestamp with time zone,
	"notes" text,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_reason" text,
	"proforma_at" timestamp with time zone,
	"contract_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quotations_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quotations_tenant_id_quote_number_uk" UNIQUE("tenant_id","quote_number")
);
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_approved_by_fk" FOREIGN KEY ("tenant_id","approved_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_fk" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;
