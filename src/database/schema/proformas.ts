import { sql } from 'drizzle-orm';
import {
  date,
  foreignKey,
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
import { proformaStatusEnum } from './enums';
import { projects } from './projects';
import { quotations } from './quotations';
import { rateVersions } from './rate-tables';
import { tenants } from './tenants';
import { users } from './users';

export const proformas = pgTable(
  'proformas',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    quotationId: uuid('quotation_id').notNull(),
    // Denormalized from the quotation at issue time (copy, not a join) —
    // cheap query-time access without joining back to quotations.
    projectId: uuid('project_id').notNull(),
    customerId: uuid('customer_id').notNull(),

    proformaNumber: text('proforma_number').notNull(),
    fiscalYearLabel: text('fiscal_year_label').notNull(),

    // Immutable money snapshot copied off the quotation at issue time (see
    // ProformasRepository.issue). Column names follow this table's own
    // convention (vatEtb/totalEtb) rather than the quotation's
    // (taxAmountEtb/totalPriceEtb) — same precision, numeric(14,2).
    //
    // subtotalEtb is the TAXABLE BASE (quotation subtotal + margin amount),
    // not the quotation's pre-margin subtotalEtb — so subtotalEtb + vatEtb =
    // totalEtb holds by construction (VAT was computed on subtotal+margin at
    // quote time; margin itself is not a proforma column, see decision (a)
    // in the finance-exports-sms phase-3 report).
    subtotalEtb: numeric('subtotal_etb', { precision: 14, scale: 2 }).notNull(),
    vatEtb: numeric('vat_etb', { precision: 14, scale: 2 }).notNull(),
    totalEtb: numeric('total_etb', { precision: 14, scale: 2 }).notNull(),
    rateVersionId: uuid('rate_version_id')
      .notNull()
      .references(() => rateVersions.id),

    // Immutable snapshot of the quotation's calc output at issue time — NOT
    // a live join back to quotations (that table can still change status
    // etc. after conversion). Copied once in ProformasRepository.issue() and
    // never updated. The customer-facing document renders technicalSpec but
    // deliberately does NOT render pricingBreakdown's cost itemization or
    // margin (see decision (a)) — pricingBreakdown is kept anyway as an
    // internal audit trail for Phase 4, not for customer display.
    technicalSpec: jsonb('technical_spec').notNull(),
    pricingBreakdown: jsonb('pricing_breakdown').notNull(),

    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    issuedByUserId: uuid('issued_by_user_id'),
    // Client PDF lists payment validity as a single date, not a schedule
    // table (none exists yet).
    validUntil: date('valid_until'),

    status: proformaStatusEnum('status').notNull().default('ISSUED'),
    cancelReason: text('cancel_reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    // Customer-facing document id — enforce uniqueness so a sequence bug
    // fails loud instead of silently issuing a duplicate number.
    unique('proformas_tenant_id_number_uk').on(
      table.tenantId,
      table.proformaNumber,
    ),
    // Defense in depth: the quotation CAS (APPROVED -> CONVERTED_TO_PROFORMA)
    // already makes a second conversion of the same quote impossible, this
    // just makes that invariant visible at the schema level too.
    unique('proformas_tenant_id_quotation_id_uk').on(
      table.tenantId,
      table.quotationId,
    ),
    foreignKey({
      name: 'proformas_quotation_fk',
      columns: [table.tenantId, table.quotationId],
      foreignColumns: [quotations.tenantId, quotations.id],
    }),
    foreignKey({
      name: 'proformas_project_fk',
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    foreignKey({
      name: 'proformas_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'proformas_issued_by_fk',
      columns: [table.tenantId, table.issuedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export type ProformaStatus = (typeof proformaStatusEnum.enumValues)[number];
