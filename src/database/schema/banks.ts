import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { bankTxKindEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

/** Mutable master data — deactivate (isActive) instead of deleting. */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    bankName: text('bank_name').notNull(),
    accountNumber: text('account_number').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })],
);

/**
 * Immutable, manually-entered bank ledger — insert-only, mirrors the
 * account's real-world statement line by line.
 *
 * paymentId/expenseId are plain uuid columns here, deliberately WITHOUT a
 * drizzle-level `foreignKey()` to payments/expenses: those two tables both
 * import `bankAccounts` from this file (for their own bankAccountId FK), so
 * importing them back here would create a banks.ts <-> payments.ts/
 * expenses.ts circular module dependency — pgTable's config callback runs
 * eagerly at import time, so a real cycle would hit an uninitialized export.
 * The FK constraints are instead hand-added as raw SQL in this table's
 * migration (see the finance schema migration's trailing ALTER TABLE
 * statements) — same "hand-finish after generate" pattern already used for
 * RLS/grants on every tenant table in this codebase.
 */
export const bankTransactions = pgTable(
  'bank_transactions',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    bankAccountId: uuid('bank_account_id').notNull(),
    txDate: date('tx_date').notNull(),
    // Signed: positive = deposit, negative = withdrawal.
    amountEtb: numeric('amount_etb', { precision: 14, scale: 2 }).notNull(),
    kind: bankTxKindEnum('kind').notNull(),
    description: text('description'),
    // Link to the payment/expense this tx mirrors, when applicable — FK
    // added by hand in the migration, see the doc comment above.
    paymentId: uuid('payment_id'),
    expenseId: uuid('expense_id'),
    recordedByUserId: uuid('recorded_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    foreignKey({
      name: 'bank_transactions_account_fk',
      columns: [table.tenantId, table.bankAccountId],
      foreignColumns: [bankAccounts.tenantId, bankAccounts.id],
    }),
    foreignKey({
      name: 'bank_transactions_recorded_by_fk',
      columns: [table.tenantId, table.recordedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export type BankTxKind = (typeof bankTxKindEnum.enumValues)[number];
