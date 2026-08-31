CREATE TYPE "public"."bank_tx_kind" AS ENUM('DEPOSIT', 'WITHDRAWAL', 'CHARGE', 'TRANSFER_IN', 'TRANSFER_OUT');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('MATERIALS', 'TRANSPORT', 'SALARY_ADVANCE', 'RENT', 'UTILITIES', 'FUEL', 'PER_DIEM', 'OFFICE', 'TAX', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('RECORDED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CBE_BIRR', 'TELEBIRR', 'OTHER');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"tx_date" date NOT NULL,
	"amount_etb" numeric(14, 2) NOT NULL,
	"kind" "bank_tx_kind" NOT NULL,
	"description" text,
	"payment_id" uuid,
	"expense_id" uuid,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transactions_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"expense_number" text NOT NULL,
	"fiscal_year_label" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_tin" text,
	"supplier_licence_on_file" boolean DEFAULT false NOT NULL,
	"amount_etb" numeric(14, 2) NOT NULL,
	"wht_rate_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"wht_etb" numeric(14, 2) DEFAULT '0' NOT NULL,
	"rate_version_id" uuid,
	"paid_via" "payment_method" NOT NULL,
	"bank_account_id" uuid,
	"expense_date" date NOT NULL,
	"recorded_by_user_id" uuid,
	"status" "expense_status" DEFAULT 'RECORDED' NOT NULL,
	"reversal_of_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "expenses_tenant_id_number_uk" UNIQUE("tenant_id","expense_number")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price_etb" numeric(14, 2) NOT NULL,
	"line_total_etb" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_lines_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"fiscal_year_label" text NOT NULL,
	"proforma_id" uuid,
	"customer_id" uuid NOT NULL,
	"project_id" uuid,
	"subtotal_etb" numeric(14, 2) NOT NULL,
	"vat_etb" numeric(14, 2) NOT NULL,
	"wht_etb" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_etb" numeric(14, 2) NOT NULL,
	"rate_version_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'ISSUED' NOT NULL,
	"void_reason" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" uuid,
	"due_date" date,
	"fiscal_receipt_number" text,
	"fiscal_device_serial" text,
	"fiscal_issued_at" timestamp with time zone,
	"fiscal_kind" text,
	"fiscal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "invoices_tenant_id_number_uk" UNIQUE("tenant_id","invoice_number")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_etb" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "payment_allocations_tenant_payment_invoice_uk" UNIQUE("tenant_id","payment_id","invoice_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"tenant_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" text NOT NULL,
	"fiscal_year_label" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"amount_etb" numeric(14, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"bank_account_id" uuid,
	"reference" text,
	"note" text,
	"received_by_user_id" uuid,
	"reversal_of_payment_id" uuid,
	"reverse_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "payments_tenant_id_receipt_number_uk" UNIQUE("tenant_id","receipt_number")
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_fk" FOREIGN KEY ("tenant_id","bank_account_id") REFERENCES "public"."bank_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_recorded_by_fk" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rate_version_id_rate_versions_id_fk" FOREIGN KEY ("rate_version_id") REFERENCES "public"."rate_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bank_account_fk" FOREIGN KEY ("tenant_id","bank_account_id") REFERENCES "public"."bank_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_fk" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reversal_of_fk" FOREIGN KEY ("tenant_id","reversal_of_expense_id") REFERENCES "public"."expenses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."invoices"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rate_version_id_rate_versions_id_fk" FOREIGN KEY ("rate_version_id") REFERENCES "public"."rate_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_proforma_fk" FOREIGN KEY ("tenant_id","proforma_id") REFERENCES "public"."proformas"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_fk" FOREIGN KEY ("tenant_id","issued_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."invoices"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_fk" FOREIGN KEY ("tenant_id","bank_account_id") REFERENCES "public"."bank_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_fk" FOREIGN KEY ("tenant_id","received_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversal_of_fk" FOREIGN KEY ("tenant_id","reversal_of_payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Hand-added: bank_transactions.payment_id/expense_id are plain uuid
-- columns in the TS schema (src/database/schema/banks.ts) so that file does
-- not have to import payments.ts/expenses.ts — both of THOSE files already
-- import banks.ts for their own bankAccountId FK, and the reverse import
-- would create a circular module dependency (pgTable's column/FK config
-- runs eagerly at import time). The constraints themselves are added here
-- by hand instead, same "generate, then hand-finish" pattern already used
-- for RLS/grants below.
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_expense_fk" FOREIGN KEY ("tenant_id","expense_id") REFERENCES "public"."expenses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- RLS, mirroring 0033_proformas_rls.sql (the newest pattern): policies
-- scoped to the role that needs them (tenant_isolation -> app_user,
-- admin_bypass -> postgres), never PUBLIC — an unscoped PERMISSIVE policy
-- gets OR'd with every other PERMISSIVE policy on the table for every role,
-- which defeats index usage. FORCE so the table owner is also subject to
-- RLS outside admin_bypass; the app connects as app_user. Superusers bypass
-- RLS regardless, which is what db:seed relies on.
--
-- Every table below already has SELECT/INSERT/UPDATE/DELETE on app_user
-- the moment it's created — migration 0001's schema-wide
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ... ON TABLES TO
-- app_user` applies automatically to any new table, same reasoning as
-- 0028_revoke_delete_rate_versions.sql. So immutability here is expressed
-- as explicit REVOKE of what shouldn't be there, not GRANT of what should.

-- invoices: append-only doc + mutable payment-status head (see the
-- schema's own doc comment) — UPDATE granted for the status/voidReason
-- transitions, no DELETE.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON invoices
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON invoices
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
REVOKE DELETE ON invoices FROM app_user;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoices_tenant_created_idx
  ON invoices (tenant_id, created_at DESC);--> statement-breakpoint

-- invoice_lines: written once with the parent invoice, never edited after —
-- no UPDATE, no DELETE.
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON invoice_lines
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON invoice_lines
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
REVOKE UPDATE, DELETE ON invoice_lines FROM app_user;--> statement-breakpoint

-- payments: fully immutable receipts ledger — no status column, no UPDATE,
-- no DELETE (see the schema's own doc comment: corrections are reversing
-- INSERTs, never edits of the original row).
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON payments
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON payments
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
REVOKE UPDATE, DELETE ON payments FROM app_user;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payments_tenant_created_idx
  ON payments (tenant_id, created_at DESC);--> statement-breakpoint

-- payment_allocations: append-only, same reasoning as payments itself — no
-- UPDATE, no DELETE.
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON payment_allocations
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON payment_allocations
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
REVOKE UPDATE, DELETE ON payment_allocations FROM app_user;--> statement-breakpoint

-- expenses: insert-only ledger — status labels whether a row IS a reversal,
-- it is never flipped on the original (see the schema's own doc comment).
-- No UPDATE, no DELETE.
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON expenses
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON expenses
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
REVOKE UPDATE, DELETE ON expenses FROM app_user;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS expenses_tenant_created_idx
  ON expenses (tenant_id, created_at DESC);--> statement-breakpoint

-- bank_accounts: mutable master data — deactivate (isActive) instead of
-- deleting, so UPDATE is granted but DELETE is not.
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON bank_accounts
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON bank_accounts
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
REVOKE DELETE ON bank_accounts FROM app_user;--> statement-breakpoint

-- bank_transactions: immutable, manually-entered ledger — insert-only, no
-- UPDATE, no DELETE.
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE bank_transactions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON bank_transactions
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON bank_transactions
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
REVOKE UPDATE, DELETE ON bank_transactions FROM app_user;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bank_transactions_tenant_created_idx
  ON bank_transactions (tenant_id, created_at DESC);