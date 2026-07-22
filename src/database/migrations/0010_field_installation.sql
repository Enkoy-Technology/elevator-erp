CREATE TYPE "public"."crew_type" AS ENUM('INSTALLATION', 'MAINTENANCE', 'EMERGENCY');--> statement-breakpoint
CREATE TYPE "public"."install_phase_kind" AS ENUM('SHAFT_PREPARATION', 'MECHANICAL_ASSEMBLY', 'ELECTRICAL_WIRING', 'TESTING_COMMISSIONING', 'HANDOVER');--> statement-breakpoint
CREATE TYPE "public"."install_phase_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint

CREATE TABLE "crews" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"crew_type" "crew_type" DEFAULT 'INSTALLATION' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crews_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);--> statement-breakpoint

CREATE TABLE "crew_members" (
	"tenant_id" uuid NOT NULL,
	"crew_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_members_tenant_id_crew_id_user_id_pk" PRIMARY KEY("tenant_id","crew_id","user_id")
);--> statement-breakpoint

CREATE TABLE "project_phases" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_kind" "install_phase_kind" NOT NULL,
	"sort_order" integer NOT NULL,
	"status" "install_phase_status" DEFAULT 'PENDING' NOT NULL,
	"checklist_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_crew_id" uuid,
	"lead_engineer_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"sign_off_name" text,
	"sign_off_signature_url" text,
	"sign_off_stamp_url" text,
	"sign_off_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_phases_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "project_phases_project_kind_unique" UNIQUE("tenant_id","project_id","phase_kind")
);--> statement-breakpoint

ALTER TABLE "crews" ADD CONSTRAINT "crews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_fk" FOREIGN KEY ("tenant_id","crew_id") REFERENCES "public"."crews"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_crew_fk" FOREIGN KEY ("tenant_id","assigned_crew_id") REFERENCES "public"."crews"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_lead_fk" FOREIGN KEY ("tenant_id","lead_engineer_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "project_phases_project_idx" ON "project_phases" ("tenant_id","project_id");
