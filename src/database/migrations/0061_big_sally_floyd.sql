CREATE TYPE "public"."contract_instalment_status" AS ENUM('PENDING', 'INVOICED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('DRAFT', 'SIGNED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "contract_instalments" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"label" text NOT NULL,
	"due_date" date,
	"amount_etb" numeric(14, 2) NOT NULL,
	"status" "contract_instalment_status" DEFAULT 'PENDING' NOT NULL,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_instalments_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "contract_instalments_tenant_contract_sequence_uk" UNIQUE("tenant_id","contract_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"proforma_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"contract_number" text NOT NULL,
	"fiscal_year_label" text NOT NULL,
	"contract_value_etb" numeric(14, 2) NOT NULL,
	"scope_of_work" text,
	"terms_and_conditions" text,
	"warranty_months" integer,
	"status" "contract_status" DEFAULT 'DRAFT' NOT NULL,
	"signed_at" date,
	"handed_over_at" date,
	"handed_over_to_name" text,
	"handover_notes" text,
	"cancel_reason" text,
	"issued_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "contracts_tenant_id_number_uk" UNIQUE("tenant_id","contract_number"),
	CONSTRAINT "contracts_tenant_id_proforma_id_uk" UNIQUE("tenant_id","proforma_id")
);
--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "inspection_results" text;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "parts_replaced" text;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "recommendations" text;--> statement-breakpoint
ALTER TABLE "contract_instalments" ADD CONSTRAINT "contract_instalments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_instalments" ADD CONSTRAINT "contract_instalments_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_instalments" ADD CONSTRAINT "contract_instalments_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."invoices"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_proforma_fk" FOREIGN KEY ("tenant_id","proforma_id") REFERENCES "public"."proformas"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_issued_by_fk" FOREIGN KEY ("tenant_id","issued_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;