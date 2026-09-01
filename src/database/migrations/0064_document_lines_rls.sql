-- RLS for the five tables added by 0063 (quotation_lines, proforma_lines,
-- quotation_payment_terms, document_boilerplate, component_specifications),
-- same pattern as 0062_contracts_rls.sql: REVOKE what app_user should not
-- have rather than GRANT what it should. Migration 0001's `ALTER DEFAULT
-- PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
-- TO app_user` already hands every new table all four privileges the moment
-- it is created, so a GRANT here would be a silent no-op — a mistake this
-- project has made three times.
--
-- DELETE, table by table — the only privilege that differs between them:
--
--   quotation_lines, quotation_payment_terms: DELETE STAYS GRANTED. This is
--     deliberate, not an oversight. A quotation is a DRAFT document that is
--     genuinely edited before it is sent: the salesperson adds a third lift,
--     removes it, re-sequences the remaining two. Modelling that as a
--     soft-delete flag would mean every read path filters on it and the
--     `(tenant_id, quotation_id, sequence)` unique constraint collides with
--     the tombstone of a line that was removed — so the row goes. The
--     document the customer actually holds is the PROFORMA, and its lines
--     are append-only below.
--
--   proforma_lines: DELETE REVOKED. A proforma is issued and the customer
--     holds a copy; its lines are a snapshot of what was offered. A wrong
--     proforma is CANCELLED (proforma_status) and re-issued, never edited
--     into agreement with a later story.
--
--   document_boilerplate, component_specifications: DELETE STAYS GRANTED.
--     Tenant-owned content, not a ledger and not customer-facing on its own
--     — a tenant that stops selling a component brand removes the row. The
--     issued documents that rendered it are unaffected: they carry their own
--     snapshots.
--
-- UPDATE stays granted everywhere, including proforma_lines: the snapshot is
-- written by the issue path and its immutability is enforced in the
-- repository, matching how `contracts` handles the same tension (0062).
ALTER TABLE quotation_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE quotation_lines FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON quotation_lines
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON quotation_lines
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

ALTER TABLE proforma_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE proforma_lines FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON proforma_lines
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON proforma_lines
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

REVOKE DELETE ON proforma_lines FROM app_user;--> statement-breakpoint

ALTER TABLE quotation_payment_terms ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE quotation_payment_terms FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON quotation_payment_terms
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON quotation_payment_terms
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

ALTER TABLE document_boilerplate ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE document_boilerplate FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON document_boilerplate
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON document_boilerplate
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

ALTER TABLE component_specifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE component_specifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON component_specifications
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON component_specifications
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');
