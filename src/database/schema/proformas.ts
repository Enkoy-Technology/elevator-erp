import { sql } from 'drizzle-orm';
import {
  date,
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
import { proformaStatusEnum } from './enums';
import { projects } from './projects';
import { quotations } from './quotations';
import { rateVersions } from './rate-tables';
import { tenants } from './tenants';
import { users } from './users';

/**
 * One row of the payment schedule as it was printed: "50% on signing".
 * The shape stored in `proformas.paymentTerms`, mirroring the three columns
 * a `quotation_payment_terms` row carries.
 */
export interface ProformaPaymentTerm {
  sequence: number;
  label: string;
  /** A 2-decimal string, same as the numeric(5,2) column it came from. */
  percent: string;
  triggerEvent: string | null;
}

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
    // subtotalEtb is the TAXABLE BASE — not the quotation's pre-margin
    // subtotalEtb, and NOT quote.subtotalEtb + quote.marginAmountEtb either
    // (those are two independently-rounded 2dp columns; summing them can be
    // a cent off from the real taxable base). It is copied verbatim from
    // quote.pricingBreakdown.subtotalWithMargin — the single full-precision
    // value VAT was actually computed from (see ElevatorCalcService.
    // calculateSpecs / QuotationsService.createForProject) — so
    // subtotalEtb + vatEtb = totalEtb holds because both sides trace back
    // to the same source number, never re-derived from already-rounded
    // parts. Margin itself is not a proforma column (decision (a) in the
    // finance-exports-sms phase-3 report).
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

    // ---------------------------------------------------------------------
    // Commercial terms, copied off the quotation at issue time — the same
    // snapshot rule as the money and jsonb columns above, never a live join
    // back to `quotations` (a quotation can be revised after conversion, and
    // the customer holds THIS document). Column-for-column mirrors of
    // `quotations`' own terms columns; nullable because a quotation issued
    // before those columns existed has none.
    // ---------------------------------------------------------------------
    /** Their own offer reference, e.g. "Rodas FUJIHD-E02". */
    referenceCode: text('reference_code'),
    deliveryDays: integer('delivery_days'),
    warrantyPartsMonths: integer('warranty_parts_months'),
    warrantyFreeServiceMonths: integer('warranty_free_service_months'),
    /** The validity NUMBER the document prints ("valid for 5 days"); the
     * `validUntil` date below is what the system enforces. */
    validityDays: integer('validity_days'),

    /**
     * The payment schedule as the offer stated it, snapshotted verbatim from
     * `quotation_payment_terms` at issue time.
     *
     * jsonb, NOT a mirror `proforma_payment_terms` table (unlike
     * `proforma_lines`): these rows are never edited, never re-sequenced,
     * never queried by percent and never joined — the DRAFT-gated
     * replace-all/resequence machinery that earns `quotation_payment_terms`
     * its own table has no counterpart on an issued document. One nullable
     * column on a row that already carries two jsonb snapshots costs a table,
     * a composite FK, a unique constraint and an RLS policy less. NULL means
     * "issued before terms existed"; `[]` means "no schedule was stated".
     *
     * ponytail: promote to a real table only if finance ever needs to report
     * across instalment lines.
     */
    paymentTerms: jsonb('payment_terms').$type<ProformaPaymentTerm[]>(),

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
