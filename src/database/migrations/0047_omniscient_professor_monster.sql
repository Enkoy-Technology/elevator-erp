CREATE TYPE "public"."message_channel" AS ENUM('SMS', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"channel" "message_channel" NOT NULL,
	"recipient" text NOT NULL,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"dedupe_key" text NOT NULL,
	"provider_message_id" text,
	"provider_name" text,
	"sent_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"subject_kind" text,
	"subject_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_messages_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "outbound_messages_tenant_id_dedupe_key_uk" UNIQUE("tenant_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_created_by_fk" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;