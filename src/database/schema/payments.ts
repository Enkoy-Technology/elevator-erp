import { sql } from 'drizzle-orm';
import {
  foreignKey,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { bankAccounts } from './banks';
import { customers } from './customers';
import { paymentMethodEnum } from './enums';
import { invoices } from './invoices';
import { tenants } from './tenants';
import { users } from './users';

/**
 * Immutable receipts ledger: no `status` column, no UPDATE grant at all.
 * Corrections are reversing entries, never edits — and unlike invoices'
 * status head, even "this payment was reversed" is not stored as a
 * mutation of the original row. It is INFERRED from whether any other
 * payment's `reversalOfPaymentId` points at this one. A reversal is a plain
 * INSERT of a new row with a negative amountEtb and reversalOfPaymentId set
 * to the original's id + a reverseReason; the original row is never
 * touched again.
 */
export const payments = pgTable(
  'payments',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    receiptNumber: text('receipt_number').notNull(),
    fiscalYearLabel: text('fiscal_year_label').notNull(),
    customerId: uuid('customer_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    amountEtb: numeric('amount_etb', { precision: 14, scale: 2 }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    bankAccountId: uuid('bank_account_id'),
    // Cheque number / bank transfer reference / telebirr txn id, etc.
    reference: text('reference'),
    note: text('note'),
    receivedByUserId: uuid('received_by_user_id'),
    // Self-FK, set only on the reversing row (see the table doc comment).
    reversalOfPaymentId: uuid('reversal_of_payment_id'),
    reverseReason: text('reverse_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('payments_tenant_id_receipt_number_uk').on(
      table.tenantId,
      table.receiptNumber,
    ),
    foreignKey({
      name: 'payments_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'payments_bank_account_fk',
      columns: [table.tenantId, table.bankAccountId],
      foreignColumns: [bankAccounts.tenantId, bankAccounts.id],
    }),
    foreignKey({
      name: 'payments_received_by_fk',
      columns: [table.tenantId, table.receivedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'payments_reversal_of_fk',
      columns: [table.tenantId, table.reversalOfPaymentId],
      foreignColumns: [table.tenantId, table.id],
    }),
  ],
);

export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

/**
 * Which invoice(s) a payment was applied to. Append-only, like payments
 * itself: allocations belonging to a reversing payment may carry a
 * negative amountEtb (undoing a prior allocation), but no row is ever
 * edited or removed — no UPDATE/DELETE grant.
 */
export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    paymentId: uuid('payment_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    amountEtb: numeric('amount_etb', { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('payment_allocations_tenant_payment_invoice_uk').on(
      table.tenantId,
      table.paymentId,
      table.invoiceId,
    ),
    foreignKey({
      name: 'payment_allocations_payment_fk',
      columns: [table.tenantId, table.paymentId],
      foreignColumns: [payments.tenantId, payments.id],
    }),
    foreignKey({
      name: 'payment_allocations_invoice_fk',
      columns: [table.tenantId, table.invoiceId],
      foreignColumns: [invoices.tenantId, invoices.id],
    }),
  ],
);
