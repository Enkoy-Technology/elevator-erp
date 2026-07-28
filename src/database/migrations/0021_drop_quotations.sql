-- Lean scope: Shining Star prices deals outside the system, so the quotation
-- document lifecycle (draft -> approved -> proforma -> contract + branded PDF)
-- has no user. Projects now carry the deal value directly on
-- quoted_amount_etb / contract_amount_etb, set when a rep advances the stage.

DROP TABLE IF EXISTS quotations;--> statement-breakpoint
DROP TYPE IF EXISTS quote_status;
