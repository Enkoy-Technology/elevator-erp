CREATE TYPE "public"."proforma_status" AS ENUM('ISSUED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"fiscal_year_label" text NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "document_sequences_tenant_id_kind_fiscal_year_label_pk" PRIMARY KEY("tenant_id","kind","fiscal_year_label")
);
--> statement-breakpoint
CREATE TABLE "proformas" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"proforma_number" text NOT NULL,
	"fiscal_year_label" text NOT NULL,
	"subtotal_etb" numeric(14, 2) NOT NULL,
	"vat_etb" numeric(14, 2) NOT NULL,
	"total_etb" numeric(14, 2) NOT NULL,
	"rate_version_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" uuid,
	"valid_until" date,
	"status" "proforma_status" DEFAULT 'ISSUED' NOT NULL,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proformas_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "proformas_tenant_id_number_uk" UNIQUE("tenant_id","proforma_number"),
	CONSTRAINT "proformas_tenant_id_quotation_id_uk" UNIQUE("tenant_id","quotation_id")
);
--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_rate_version_id_rate_versions_id_fk" FOREIGN KEY ("rate_version_id") REFERENCES "public"."rate_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_quotation_fk" FOREIGN KEY ("tenant_id","quotation_id") REFERENCES "public"."quotations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_issued_by_fk" FOREIGN KEY ("tenant_id","issued_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;