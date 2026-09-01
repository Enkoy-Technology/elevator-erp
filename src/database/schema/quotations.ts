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
import { rateVersions } from './rate-tables';
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

    // Immutable snapshots of the calc that produced this quote.
    calcInput: jsonb('calc_input').notNull(),
    technicalSpec: jsonb('technical_spec').notNull(),
    pricingBreakdown: jsonb('pricing_breakdown').notNull(),

    // Which statutory rate version priced the VAT line below — never a
    // hardcoded percent (see QuotationsService.createForProject).
    rateVersionId: uuid('rate_version_id')
      .notNull()
      .references(() => rateVersions.id),

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

    /**
     * What the calculator produced BEFORE negotiation, on the same basis as
     * `totalPriceEtb` — i.e. VAT-INCLUSIVE. Null on a quote that was never
     * negotiated.
     *
     * This client prices backward from a round grand total: their real
     * proforma reads 7,835,000.00 where the formula gives 8,521,500.00, and
     * 7,835,000 / 1.15 = 6,813,043.48 + VAT 1,021,956.52 balances to the
     * cent. So `discountAmountEtb` = `calculatedTotalEtb` - `totalPriceEtb`
     * (686,500.00 here), and `discountPercent` = that over
     * `calculatedTotalEtb` (8.06%). Both stored VAT-inclusive; the percent
     * is the same on either basis, the AMOUNT is not — reading it as an
     * ex-VAT figure would silently under-report every discount by the VAT
     * rate.
     *
     * `totalPriceEtb` above is untouched: it remains the figure the customer
     * pays and the figure every downstream document copies.
     */
    calculatedTotalEtb: numeric('calculated_total_etb', {
      precision: 14,
      scale: 2,
    }),
    discountAmountEtb: numeric('discount_amount_etb', {
      precision: 14,
      scale: 2,
    }),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
    /**
     * Who signed off the discount, when `tenants.discountApprovalThresholdPercent`
     * required it. Null when the threshold is unset (the default) or the
     * discount is under it — approval is deliberately not universal.
     */
    discountApprovedByUserId: uuid('discount_approved_by_user_id'),

    // ---------------------------------------------------------------------
    // Commercial terms the client prints as prose on page 1.
    // ---------------------------------------------------------------------
    /** Their own offer reference, e.g. "Rodas FUJIHD-E02". */
    referenceCode: text('reference_code'),
    deliveryDays: integer('delivery_days'),
    /** Theirs: 60 months parts, 12 months free service. */
    warrantyPartsMonths: integer('warranty_parts_months'),
    warrantyFreeServiceMonths: integer('warranty_free_service_months'),
    /**
     * The offer-validity NUMBER they print as text ("valid for 5 days").
     * `validUntil` below is the resolved date the system enforces; this is
     * what the document says, kept separately so re-rendering an old
     * document never re-states a validity that was counted from a different
     * issue date.
     */
    validityDays: integer('validity_days'),

    validUntil: timestamp('valid_until', { withTimezone: true }),
    notes: text('notes'),

    // Client-facing PDF requires Sales-Manager approval before it can be
    // generated (Task 3) — stamped on the PENDING_APPROVAL -> APPROVED
    // transition.
    approvedByUserId: uuid('approved_by_user_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedReason: text('rejected_reason'),

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
      name: 'quotations_discount_approved_by_fk',
      columns: [table.tenantId, table.discountApprovedByUserId],
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
