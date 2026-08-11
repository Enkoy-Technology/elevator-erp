import { sql } from 'drizzle-orm';
import {
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
import { invoiceStatusEnum } from './enums';
import { proformas } from './proformas';
import { projects } from './projects';
import { rateVersions } from './rate-tables';
import { tenants } from './tenants';
import { users } from './users';

/**
 * Invoices are the ERP's own internal AR record — NEVER the legal tax
 * document. Ethiopia currently runs the ETR regime (nightly Z-reports): the
 * customer's certified fiscal device issues the number that is legally
 * binding, and invoiceNumber here is only an internal reference. The five
 * `fiscal*` columns are a manual mirror of that device's receipt — re-keyed
 * by hand, not fetched from any clearance API (there is no accreditation
 * spec or date to build against yet). See
 * docs/planning/DECISIONS-platform-and-ethiopian-compliance.md §4.
 *
 * "Append-only doc + mutable payment-status head": subtotalEtb/vatEtb/
 * whtEtb/totalEtb and the invoice_lines rows are written once at issue and
 * never change. `status` (and `voidReason`) is the one thing that keeps
 * moving afterward — ISSUED -> PARTIALLY_PAID -> PAID as payment_allocations
 * land against this invoice, or -> VOID — so UPDATE is granted on this
 * table but DELETE is not.
 */
export const invoices = pgTable(
  'invoices',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    invoiceNumber: text('invoice_number').notNull(),
    fiscalYearLabel: text('fiscal_year_label').notNull(),

    // Nullable: invoices may be standalone (e.g. maintenance billing) with
    // no proforma/quotation lineage at all.
    proformaId: uuid('proforma_id'),
    customerId: uuid('customer_id').notNull(),
    projectId: uuid('project_id'),

    subtotalEtb: numeric('subtotal_etb', { precision: 14, scale: 2 }).notNull(),
    vatEtb: numeric('vat_etb', { precision: 14, scale: 2 }).notNull(),
    // Withholding the CUSTOMER retains when paying this invoice — reduces
    // cash actually received, never this invoice's own totalEtb. Distinct
    // from expenses.whtEtb (the ERP's own WHT liability when paying a
    // supplier) — same statutory mechanism, opposite direction of money.
    whtEtb: numeric('wht_etb', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    // Mirrors the withholding voucher the customer hands the supplier when
    // they retain WHT (see PaymentsRepository / InvoicesRepository's
    // recordWithholding doc comment) — same "manual mirror of an external
    // legal document" idea as the fiscal* columns below, just for the
    // withholding voucher instead of the ETR receipt. Both nullable: most
    // invoices never see a withholding credit at all.
    whtVoucherRef: text('wht_voucher_ref'),
    whtRecordedAt: timestamp('wht_recorded_at', { withTimezone: true }),
    totalEtb: numeric('total_etb', { precision: 14, scale: 2 }).notNull(),
    rateVersionId: uuid('rate_version_id')
      .notNull()
      .references(() => rateVersions.id),

    status: invoiceStatusEnum('status').notNull().default('ISSUED'),
    voidReason: text('void_reason'),

    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    issuedByUserId: uuid('issued_by_user_id'),
    dueDate: date('due_date'),

    // Manual mirror of the customer's ETR/fiscal-device receipt — see the
    // table doc comment above. All nullable; none of these is ever this
    // invoice's own legal identifier.
    fiscalReceiptNumber: text('fiscal_receipt_number'),
    fiscalDeviceSerial: text('fiscal_device_serial'),
    fiscalIssuedAt: timestamp('fiscal_issued_at', { withTimezone: true }),
    fiscalKind: text('fiscal_kind'),
    fiscalNote: text('fiscal_note'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('invoices_tenant_id_number_uk').on(
      table.tenantId,
      table.invoiceNumber,
    ),
    foreignKey({
      name: 'invoices_proforma_fk',
      columns: [table.tenantId, table.proformaId],
      foreignColumns: [proformas.tenantId, proformas.id],
    }),
    foreignKey({
      name: 'invoices_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'invoices_project_fk',
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    foreignKey({
      name: 'invoices_issued_by_fk',
      columns: [table.tenantId, table.issuedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];

/**
 * Line items, written once alongside the parent invoice and never updated
 * afterward — no UPDATE/DELETE grant. Correcting an issued invoice means
 * VOID + reissue at the service layer (T2+), not editing these rows.
 */
export const invoiceLines = pgTable(
  'invoice_lines',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    invoiceId: uuid('invoice_id').notNull(),
    lineNo: integer('line_no').notNull(),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitPriceEtb: numeric('unit_price_etb', {
      precision: 14,
      scale: 2,
    }).notNull(),
    lineTotalEtb: numeric('line_total_etb', {
      precision: 14,
      scale: 2,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    foreignKey({
      name: 'invoice_lines_invoice_fk',
      columns: [table.tenantId, table.invoiceId],
      foreignColumns: [invoices.tenantId, invoices.id],
    }),
  ],
);
