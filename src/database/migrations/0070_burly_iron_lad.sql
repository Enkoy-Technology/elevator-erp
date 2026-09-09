CREATE TABLE "message_templates" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "message_templates_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_fk" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;
-- Tenant isolation, same shape as every other tenant table (see 0064).
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE message_templates FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON message_templates
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON message_templates
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

-- Staff reachable on their work phone: the maintenance reminder to the
-- assigned technician was silently held for every employee whose consent
-- had never been ticked, which was all of them. A work phone on a staff
-- record is consent to work messages; the employee form now defaults the
-- box on, and this catches up the rows created before it did. Customers
-- are untouched: their consent stays an explicit, recorded act.
UPDATE users SET sms_consent_at = now()
  WHERE phone IS NOT NULL AND sms_consent_at IS NULL AND role <> 'CUSTOMER' AND deleted_at IS NULL;
