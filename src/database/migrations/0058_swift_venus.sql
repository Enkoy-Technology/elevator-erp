CREATE TABLE "idempotency_keys" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"endpoint" text NOT NULL,
	"fingerprint" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "idempotency_keys_tenant_id_key_uk" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;