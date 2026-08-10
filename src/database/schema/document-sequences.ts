import { integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

/**
 * Generic gapless per-tenant-per-fiscal-year sequence claimer. `kind` is
 * 'PROFORMA' today; Phase 4 (invoices/receipts) reuses this same table
 * instead of bolting a proforma-specific counter onto the proformas table.
 *
 * Claimed with a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
 * (see ProformasRepository.issue) — atomic and gapless under concurrency on
 * its own; no advisory lock needed, unlike RatesRepository.rotate()'s
 * read-then-write race.
 *
 * Claim protocol: increment-then-return — the RETURNED `lastValue` IS the
 * issued number, not "the value to use next time." Never read `lastValue`
 * with a plain SELECT and use it directly as the number to issue; only the
 * value that comes back from the same claiming INSERT is safe to use.
 * (Renamed from `next_value` in the Phase 4 finance migration — the old
 * name was misleading: it named the column's role between claims, not what
 * the RETURNING clause hands back.)
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind').notNull(),
    fiscalYearLabel: text('fiscal_year_label').notNull(),
    lastValue: integer('last_value').notNull().default(1),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.kind, table.fiscalYearLabel],
    }),
  ],
);
