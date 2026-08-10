-- Custom SQL migration file, put your code below! -----

-- Task 2 (2.1): a proforma can be converted to an invoice at most once.
-- Partial (WHERE proforma_id IS NOT NULL), per the brief: standalone
-- invoices (maintenance billing, no proforma lineage) all carry
-- proforma_id NULL, and Postgres already treats every NULL as distinct
-- under a plain unique constraint too — the WHERE clause is not load-
-- bearing for that case, it just keeps the index limited to (and its
-- intent readable as) "unique among actual conversions," and keeps the
-- index smaller by never indexing the NULL rows at all. Not represented in
-- invoices.ts (TS schema) at all — same convention as
-- rate_versions_one_open_per_kind (0026_busy_rumiko_fujikawa.sql): a
-- hand-authored index invisible to drizzle-kit's own diffing, so `generate`
-- never tries to touch it. InvoicesRepository.issueFromProforma() enforces
-- this at the insert and reclassifies the 23505 as a 409 (ConflictException)
-- — see its own doc comment.
CREATE UNIQUE INDEX "invoices_proforma_uk" ON "invoices" ("tenant_id","proforma_id") WHERE "proforma_id" IS NOT NULL;
