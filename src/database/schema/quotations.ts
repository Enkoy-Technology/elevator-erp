import { sql } from 'drizzle-orm';
import {
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers } from './customers';
import { quoteStatusEnum } from './enums';
import { projects } from './projects';
import { tenants } from './tenants';
import { users } from './users';

export const quotations = pgTable(
  'quotations',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    projectId: uuid('project_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    quoteNumber: text('quote_number').notNull(),
    status: quoteStatusEnum('status').notNull().default('DRAFT'),
    version: integer('version').notNull().default(1),

    // Immutable snapshots of the Phase 1 calc that produced this quote.
    calcInput: jsonb('calc_input').notNull(),
    technicalSpec: jsonb('technical_spec').notNull(),
    pricingBreakdown: jsonb('pricing_breakdown').notNull(),

    // Money lifted out of the snapshot for querying/reporting (ETB).
    marginPercent: numeric('margin_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    taxPercent: numeric('tax_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    subtotalEtb: numeric('subtotal_etb', { precision: 14, scale: 2 }).notNull(),
    marginAmountEtb: numeric('margin_amount_etb', {
      precision: 14,
      scale: 2,
    }).notNull(),
    taxAmountEtb: numeric('tax_amount_etb', {
      precision: 14,
      scale: 2,
    }).notNull(),
    totalPriceEtb: numeric('total_price_etb', {
      precision: 14,
      scale: 2,
    }).notNull(),

    validUntil: timestamp('valid_until', { withTimezone: true }),
    notes: text('notes'),

    approvedByUserId: uuid('approved_by_user_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedReason: text('rejected_reason'),
    proformaAt: timestamp('proforma_at', { withTimezone: true }),
    contractAt: timestamp('contract_at', { withTimezone: true }),

    statusChangedAt: timestamp('status_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    // Quote number is a customer-facing document id — enforce uniqueness so a
    // hash collision fails loud instead of silently duplicating a legal number.
    unique('quotations_tenant_id_quote_number_uk').on(
      table.tenantId,
      table.quoteNumber,
    ),
    foreignKey({
      name: 'quotations_project_fk',
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    foreignKey({
      name: 'quotations_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'quotations_approved_by_fk',
      columns: [table.tenantId, table.approvedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'quotations_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export type QuoteStatus = (typeof quoteStatusEnum.enumValues)[number];
