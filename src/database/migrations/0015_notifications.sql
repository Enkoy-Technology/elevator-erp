CREATE TYPE "public"."notification_type" AS ENUM('GENERAL', 'QUOTE', 'ASSIGNMENT', 'MAINTENANCE');--> statement-breakpoint
CREATE TABLE "notifications" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" DEFAULT 'GENERAL' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_path" text,
	"read_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_fk" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_tenant_user_created_idx" ON "notifications" ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_user_unread_idx" ON "notifications" ("tenant_id","user_id") WHERE "read_at" IS NULL;
