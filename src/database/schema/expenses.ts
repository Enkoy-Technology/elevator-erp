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
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { bankAccounts } from './banks';
import { expenseCategoryEnum, expenseStatusEnum, paymentMethodEnum } from './enums';
import { rateVersions } from './rate-tables';
import { tenants } from './tenants';
import { users } from './users';

/**
 * Insert-only expense ledger — no UPDATE/DELETE grant. `status` labels
 * whether a ROW ITSELF is a reversing entry (RECORDED = a normal expense,
 * REVERSED = a row that reverses an earlier one via reversalOfExpenseId);
 * it is not flipped on the original when reversed — the original keeps
 * RECORDED forever, same "corrections are new rows, not edits" rule as
 * payments.ts, just spelled with an explicit column here instead of being
 * inferred purely from inbound self-FK references.
 */
export const expenses = pgTable(
  'expenses',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    expenseNumber: text('expense_number').notNull(),
    fiscalYearLabel: text('fiscal_year_label').notNull(),
    category: expenseCategoryEnum('category').notNull(),
    supplierName: text('supplier_name').notNull(),
    supplierTin: text('supplier_tin'),
    supplierLicenceOnFile: boolean('supplier_licence_on_file')
      .notNull()
      .default(false),
    // Gross amount before WHT is withheld.
    amountEtb: numeric('amount_etb', { precision: 14, scale: 2 }).notNull(),
    // Computed at record time from the WHT rate table below — stored, not
    // recomputed later, since the statutory rate is itself effective-dated
    // and can rotate after this expense is recorded.
    whtRatePercent: numeric('wht_rate_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    whtEtb: numeric('wht_etb', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    // The WHT rate_versions row this was computed from; null when no WHT
    // applies to this expense at all (not merely a zero rate). rate_versions
    // is a global (non-tenant) table, same as proformas.rateVersionId/
    // quotations.rateVersionId, so this is a plain (non-composite)
    // reference like theirs.
    rateVersionId: uuid('rate_version_id').references(() => rateVersions.id),
    paidVia: paymentMethodEnum('paid_via').notNull(),
    bankAccountId: uuid('bank_account_id'),
    expenseDate: date('expense_date').notNull(),
    recordedByUserId: uuid('recorded_by_user_id'),
    status: expenseStatusEnum('status').notNull().default('RECORDED'),
    // Self-FK, set only on the reversing row.
    reversalOfExpenseId: uuid('reversal_of_expense_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('expenses_tenant_id_number_uk').on(
      table.tenantId,
      table.expenseNumber,
    ),
    foreignKey({
      name: 'expenses_bank_account_fk',
      columns: [table.tenantId, table.bankAccountId],
      foreignColumns: [bankAccounts.tenantId, bankAccounts.id],
    }),
    foreignKey({
      name: 'expenses_recorded_by_fk',
      columns: [table.tenantId, table.recordedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'expenses_reversal_of_fk',
      columns: [table.tenantId, table.reversalOfExpenseId],
      foreignColumns: [table.tenantId, table.id],
    }),
  ],
);

export type ExpenseCategory = (typeof expenseCategoryEnum.enumValues)[number];
export type ExpenseStatus = (typeof expenseStatusEnum.enumValues)[number];
