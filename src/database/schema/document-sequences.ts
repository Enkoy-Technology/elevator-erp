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
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind').notNull(),
    fiscalYearLabel: text('fiscal_year_label').notNull(),
    nextValue: integer('next_value').notNull().default(1),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.kind, table.fiscalYearLabel],
    }),
  ],
);
