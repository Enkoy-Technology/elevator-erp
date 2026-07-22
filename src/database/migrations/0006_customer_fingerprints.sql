-- Extensions for duplicate detection (TAD §3.4).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;--> statement-breakpoint

CREATE TABLE "customer_fingerprints" (
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name_normalized" text NOT NULL,
	"name_soundex" text NOT NULL,
	"phone_e164" text,
	"alternate_phone_e164" text,
	"building_normalized" text,
	"geohash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_fingerprints_tenant_id_customer_id_pk" PRIMARY KEY("tenant_id","customer_id")
);--> statement-breakpoint

ALTER TABLE "customer_fingerprints" ADD CONSTRAINT "customer_fingerprints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_fingerprints" ADD CONSTRAINT "customer_fingerprints_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "customer_fingerprints_name_trgm_idx" ON "customer_fingerprints" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "customer_fingerprints_building_trgm_idx" ON "customer_fingerprints" USING gin ("building_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "customer_fingerprints_phone_idx" ON "customer_fingerprints" ("tenant_id","phone_e164");--> statement-breakpoint
CREATE INDEX "customer_fingerprints_geohash_idx" ON "customer_fingerprints" ("tenant_id","geohash");--> statement-breakpoint

-- Backfill fingerprints for customers created before this migration.
INSERT INTO customer_fingerprints (
  tenant_id, customer_id, name_normalized, name_soundex,
  phone_e164, alternate_phone_e164, building_normalized, geohash
)
SELECT
  c.tenant_id,
  c.id,
  lower(regexp_replace(c.name, '[^a-zA-Z0-9\s]', ' ', 'g')),
  soundex(lower(regexp_replace(c.name, '[^a-zA-Z0-9\s]', ' ', 'g'))),
  null,
  null,
  case when c.building_name is null then null
    else lower(regexp_replace(c.building_name, '[^a-zA-Z0-9\s]', ' ', 'g'))
  end,
  null
FROM customers c
WHERE c.deleted_at is null
ON CONFLICT DO NOTHING;
