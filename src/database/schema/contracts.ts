import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers } from './customers';
import { contractInstalmentStatusEnum, contractStatusEnum } from './enums';
import { invoices } from './invoices';
import { proformas } from './proformas';
import { projects } from './projects';
import { tenants } from './tenants';
import { users } from './users';

/**
 * The signed agreement, and the last link in the customer-facing chain:
 * quotation -> proforma -> CONTRACT. Append-only like the proforma book —
 * a contract the customer has a copy of cannot be edited, only cancelled
 * and re-issued.
 *
 * `status` is what makes the client's proposal list "Contract Draft" and
 * "Contract" as two documents: they are one record rendered at two points
 * in its life. DRAFT prints "CONTRACT DRAFT" as a watermark and no
 * signature date; SIGNED prints the real thing. Issuing a draft first is
 * how the customer's lawyer gets to read it before anyone signs.
 *
 * This table is also where three documents that have nowhere else to live
 * get their data:
 *  - `warrantyMonths` + the handover date gives the Warranty Certificate
 *    its expiry, and feeds the "Warranty Expiration" reminder the client
 *    asked for (one of their five, previously unbuildable).
 *  - `handedOverAt`/`handedOverToName` give the Completion Certificate its
 *    substance. `projects.actualEndDate` exists but nothing writes it, and
 *    a handover is a customer-facing event that belongs beside the
 *    agreement it completes rather than on the internal pipeline row.
 *  - `contract_instalments` below is the Payment Schedule.
 */
export const contracts = pgTable(
  'contracts',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),

    // Issued from an accepted proforma. Denormalized from it at issue time
    // (copy, not a join), matching how proformas denormalize the quotation.
    proformaId: uuid('proforma_id').notNull(),
    projectId: uuid('project_id').notNull(),
    customerId: uuid('customer_id').notNull(),

    contractNumber: text('contract_number').notNull(),
    fiscalYearLabel: text('fiscal_year_label').notNull(),

    /** Copied off the proforma at issue time and never recomputed. */
    contractValueEtb: numeric('contract_value_etb', {
      precision: 14,
      scale: 2,
    }).notNull(),

    /** Free text: what the company is contracting to deliver. */
    scopeOfWork: text('scope_of_work'),
    /** Free text: payment terms, penalties, anything the parties agreed. */
    termsAndConditions: text('terms_and_conditions'),

    /**
     * Warranty length in months from handover (or from signing, when a
     * contract is closed without a recorded handover). Nullable because a
     * modernisation or a service-only agreement may carry none.
     */
    warrantyMonths: integer('warranty_months'),

    // The clauses the company's own paper contract states as numbers (their
    // Articles 3, 5, 6 and 7). Nullable: a clause with no value prints
    // nothing rather than a blank to fill in by hand.
    /** Article 3.2: equipment on site within N working days of the effective date. */
    deliveryWorkingDays: integer('delivery_working_days'),
    /** Article 3.3: erection and commissioning within N working days of site readiness. */
    installationWorkingDays: integer('installation_working_days'),
    /** Article 7.1: percent of the contract price per day of delay, e.g. 0.020. */
    delayPenaltyPercentPerDay: numeric('delay_penalty_percent_per_day', {
      precision: 6,
      scale: 3,
    }),
    /** Article 7.1: the penalty ceiling as a percent of the contract price, e.g. 5.00. */
    delayPenaltyCapPercent: numeric('delay_penalty_cap_percent', {
      precision: 5,
      scale: 2,
    }),
    /** Article 5.1: the advance is released only against a guarantee cheque of equal value. */
    advanceGuaranteeRequired: boolean('advance_guarantee_required')
      .notNull()
      .default(false),
    /** Article 6.2: months of free preventive service and repairs after handover. */
    freeMaintenanceMonths: integer('free_maintenance_months'),
    /** Article 8.2: where an unsettled dispute goes, e.g. the Addis Ababa Chamber of Commerce. */
    disputeForum: text('dispute_forum'),

    status: contractStatusEnum('status').notNull().default('DRAFT'),
    /** Null while DRAFT. Set once, when the parties actually sign. */
    signedAt: date('signed_at'),

    /** The handover, which the Completion Certificate renders. */
    handedOverAt: date('handed_over_at'),
    handedOverToName: text('handed_over_to_name'),
    handoverNotes: text('handover_notes'),

    cancelReason: text('cancel_reason'),

    issuedByUserId: uuid('issued_by_user_id'),
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
    unique('contracts_tenant_id_number_uk').on(
      table.tenantId,
      table.contractNumber,
    ),
    // One contract per proforma. Same defence-in-depth reasoning as
    // proformas' unique on quotationId.
    unique('contracts_tenant_id_proforma_id_uk').on(
      table.tenantId,
      table.proformaId,
    ),
    foreignKey({
      name: 'contracts_proforma_fk',
      columns: [table.tenantId, table.proformaId],
      foreignColumns: [proformas.tenantId, proformas.id],
    }),
    foreignKey({
      name: 'contracts_project_fk',
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    foreignKey({
      name: 'contracts_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'contracts_issued_by_fk',
      columns: [table.tenantId, table.issuedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

/**
 * The Payment Schedule: what the customer has agreed to pay, and when.
 *
 * Deliberately NOT invoices. An instalment is a PLAN; an invoice is a debt
 * in the AR ledger. Pre-creating invoices for a payment schedule would make
 * the ageing report show money as owed months before it is — so an
 * instalment carries `invoiceId` and stays PENDING until someone actually
 * raises the invoice for it.
 */
export const contractInstalments = pgTable(
  'contract_instalments',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    contractId: uuid('contract_id').notNull(),

    /** 1-based position, so the document prints them in agreed order. */
    sequence: integer('sequence').notNull(),
    /** e.g. "Advance on signing", "On delivery to site", "On handover". */
    label: text('label').notNull(),
    dueDate: date('due_date'),
    amountEtb: numeric('amount_etb', { precision: 14, scale: 2 }).notNull(),

    status: contractInstalmentStatusEnum('status').notNull().default('PENDING'),
    /** Set when this instalment is actually invoiced. */
    invoiceId: uuid('invoice_id'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('contract_instalments_tenant_contract_sequence_uk').on(
      table.tenantId,
      table.contractId,
      table.sequence,
    ),
    foreignKey({
      name: 'contract_instalments_contract_fk',
      columns: [table.tenantId, table.contractId],
      foreignColumns: [contracts.tenantId, contracts.id],
    }),
    foreignKey({
      name: 'contract_instalments_invoice_fk',
      columns: [table.tenantId, table.invoiceId],
      foreignColumns: [invoices.tenantId, invoices.id],
    }),
  ],
);

/** The contract lifecycle, as a union — mirrors ProformaStatus in proformas.ts. */
export type ContractStatus = (typeof contractStatusEnum.enumValues)[number];
