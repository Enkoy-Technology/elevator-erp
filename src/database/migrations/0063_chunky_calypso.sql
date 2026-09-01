CREATE TABLE "proforma_lines" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"proforma_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"product_type" text NOT NULL,
	"calc_input" jsonb,
	"technical_spec" jsonb,
	"pricing_breakdown" jsonb,
	"spec_summary" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_etb" numeric(14, 2),
	"line_total_etb" numeric(14, 2),
	"machine_room_label" text,
	"floor_labels" text,
	"floor_display_summary" text,
	"door_height_mm" integer,
	"roping_ratio" text,
	"traction_machine_type" text,
	"control_system" text,
	"power_supply" text,
	"light_supply" text,
	"entrance_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proforma_lines_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "proforma_lines_tenant_proforma_sequence_uk" UNIQUE("tenant_id","proforma_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"product_type" text NOT NULL,
	"calc_input" jsonb,
	"technical_spec" jsonb,
	"pricing_breakdown" jsonb,
	"spec_summary" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_etb" numeric(14, 2),
	"line_total_etb" numeric(14, 2),
	"machine_room_label" text,
	"floor_labels" text,
	"floor_display_summary" text,
	"door_height_mm" integer,
	"roping_ratio" text,
	"traction_machine_type" text,
	"control_system" text,
	"power_supply" text,
	"light_supply" text,
	"entrance_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_lines_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quotation_lines_tenant_quotation_sequence_uk" UNIQUE("tenant_id","quotation_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "quotation_payment_terms" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"label" text NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	"trigger_event" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_payment_terms_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quotation_payment_terms_tenant_quotation_sequence_uk" UNIQUE("tenant_id","quotation_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "component_specifications" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"sequence" integer NOT NULL,
	"component_name" text NOT NULL,
	"brand" text,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_specifications_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "component_specifications_tenant_sequence_uk" UNIQUE("tenant_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "document_boilerplate" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"section_key" text NOT NULL,
	"title" text,
	"body" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_boilerplate_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_boilerplate_tenant_section_key_uk" UNIQUE("tenant_id","section_key")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "discount_approval_threshold_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "calculated_total_etb" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "discount_amount_etb" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "discount_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "discount_approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "reference_code" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "delivery_days" integer;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "warranty_parts_months" integer;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "warranty_free_service_months" integer;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "validity_days" integer;--> statement-breakpoint
ALTER TABLE "proforma_lines" ADD CONSTRAINT "proforma_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_lines" ADD CONSTRAINT "proforma_lines_proforma_fk" FOREIGN KEY ("tenant_id","proforma_id") REFERENCES "public"."proformas"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_fk" FOREIGN KEY ("tenant_id","quotation_id") REFERENCES "public"."quotations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_payment_terms" ADD CONSTRAINT "quotation_payment_terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_payment_terms" ADD CONSTRAINT "quotation_payment_terms_quotation_fk" FOREIGN KEY ("tenant_id","quotation_id") REFERENCES "public"."quotations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_specifications" ADD CONSTRAINT "component_specifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_boilerplate" ADD CONSTRAINT "document_boilerplate_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_discount_approved_by_fk" FOREIGN KEY ("tenant_id","discount_approved_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;