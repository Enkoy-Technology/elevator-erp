-- Custom SQL migration file, put your code below! --

-- Task 4 (4.5): a payment or expense may be linked to at most one bank
-- transaction. Partial (WHERE ... IS NOT NULL), per the brief: the vast
-- majority of bank_transactions rows have no link at all, and Postgres
-- already treats every NULL as distinct under a plain unique constraint —
-- the WHERE clause just keeps the index limited to (and its intent readable
-- as) "unique among actual links," and keeps the index smaller by never
-- indexing the unlinked rows. Same convention as invoices_proforma_uk
-- (0039_invoices_proforma_unique_partial_index.sql): hand-authored, not
-- represented in banks.ts (TS schema) at all, so drizzle-kit's own diffing
-- never touches it. BankTransactionsRepository.record() enforces this at
-- the insert and reclassifies the 23505 as a 409 (ConflictException) — see
-- its own doc comment.
CREATE UNIQUE INDEX "bank_transactions_payment_uk" ON "bank_transactions" ("tenant_id","payment_id") WHERE "payment_id" IS NOT NULL;
CREATE UNIQUE INDEX "bank_transactions_expense_uk" ON "bank_transactions" ("tenant_id","expense_id") WHERE "expense_id" IS NOT NULL;