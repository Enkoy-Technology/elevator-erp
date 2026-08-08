import { date, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const rateKinds = [
  'VAT',
  'WHT_GOODS',
  'WHT_SERVICES',
  'WHT_NO_TIN',
  'PAYE_BANDS',
  'PENSION_EMPLOYEE',
  'PENSION_EMPLOYER',
] as const;
export type RateKind = (typeof rateKinds)[number];

// Deliberately GLOBAL (no tenant_id, no RLS): statutory rates are national,
// not per-tenant. Reads are open to all authenticated tenants; writes are
// ADMIN-gated at the application layer.
export const rateVersions = pgTable('rate_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: rateKinds }).notNull(),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'), // null = open-ended current version
  payload: jsonb('payload').notNull(),
  source: text('source').notNull(), // e.g. 'VAT Proclamation 1341/2024'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
