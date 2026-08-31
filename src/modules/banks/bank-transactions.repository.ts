import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, asc, count, desc, eq, getTableColumns, gte, lte, notExists, sql } from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import { isForeignKeyViolation } from '../../common/db-errors';
import { WorkflowTransitionError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import type { TenantTransaction } from '../../database/database.types';
import {
  bankAccounts,
  bankTransactions,
  expenses,
  payments,
  type BankTxKind,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export type BankTransactionRecord = typeof bankTransactions.$inferSelect;
type PaymentRecord = typeof payments.$inferSelect;
type ExpenseRecord = typeof expenses.$inferSelect;

export interface RecordBankTransactionInput {
  bankAccountId: string;
  txDate: string;
  amountEtb: string;
  kind: BankTxKind;
  description: string | null;
  paymentId: string | null;
  expenseId: string | null;
}

export interface BankTransactionListFilter {
  from?: string;
  to?: string;
}

export interface UnreconciledSide<T> {
  items: T[];
  /** True the moment more than 200 rows exist on this side — never a silent cap. */
  truncated: boolean;
}

export interface UnreconciledView {
  payments: UnreconciledSide<PaymentRecord>;
  expenses: UnreconciledSide<ExpenseRecord>;
}

const PG_UNIQUE_VIOLATION = '23505';
/** Brief 4.6: cap each side at 200 rows, never silently. */
const UNRECONCILED_CAP = 200;

/**
 * Postgres `unique_violation`, reclassified as a 409 instead of an
 * unhandled 500 — same shape as PaymentsRepository's and
 * InvoicesRepository's own copies (drizzle-orm's node-postgres driver puts
 * the real `.code` on `.cause`, not on the thrown error itself). This is
 * the 3rd occurrence codebase-wide; still duplicated rather than shared —
 * extracting the two existing copies to match is a separate cleanup this
 * task's brief does not ask for and would touch files outside its scope.
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (v: unknown): string | undefined =>
    typeof v === 'object' && v !== null ? (v as { code?: string }).code : undefined;
  return (
    code(err) === PG_UNIQUE_VIOLATION ||
    code((err as { cause?: unknown } | null)?.cause) === PG_UNIQUE_VIOLATION
  );
}

@Injectable()
export class BankTransactionsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Inserts one bank ledger line — insert-only: no update()/delete() method
   * exists on this repository, or anywhere in this module, at all (see
   * banks.ts's own doc comment on bank_transactions). Validates the linked
   * payment/expense (if any) exists in this tenant with a plain existence
   * check, then lets the two hand-authored partial unique indexes
   * (bank_transactions_payment_uk / _expense_uk — see
   * 0043_bank_transactions_link_unique_partial_index.sql) enforce "at most
   * one bank transaction per payment/expense" at the DB layer, reclassifying
   * the resulting 23505 as a 409 instead of a 500.
   */
  async record(
    tenantId: string,
    userId: string,
    input: RecordBankTransactionInput,
  ): Promise<BankTransactionRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await this.assertAccountExists(tx, input.bankAccountId);

      if (input.paymentId) {
        const [payment] = await tx
          .select({ id: payments.id, bankAccountId: payments.bankAccountId })
          .from(payments)
          .where(eq(payments.id, input.paymentId))
          .limit(1);
        if (!payment) {
          throw new NotFoundException('Payment not found');
        }
        // The payment carries its OWN bankAccountId (nullable — e.g. a CASH
        // receipt has none, and linking it to whichever account it was
        // later deposited into is exactly the reconciliation use case). But
        // when it IS set, it must match this line's account: bank_transactions
        // is insert-only with no correction path, so a link recorded against
        // the wrong account would make findUnreconciled() silently and
        // PERMANENTLY stop listing this payment for the account it actually
        // belongs to (its notExists() check only asks "is this payment
        // linked to ANY bank transaction", not "linked on this account").
        if (payment.bankAccountId !== null && payment.bankAccountId !== input.bankAccountId) {
          throw new BadRequestException(
            'This payment is recorded against a different bank account and cannot be linked here',
          );
        }
      }
      if (input.expenseId) {
        const [expense] = await tx
          .select({ id: expenses.id, bankAccountId: expenses.bankAccountId })
          .from(expenses)
          .where(eq(expenses.id, input.expenseId))
          .limit(1);
        if (!expense) {
          throw new NotFoundException('Expense not found');
        }
        // Same reasoning as the payment check above.
        if (expense.bankAccountId !== null && expense.bankAccountId !== input.bankAccountId) {
          throw new BadRequestException(
            'This expense is recorded against a different bank account and cannot be linked here',
          );
        }
      }

      let row: BankTransactionRecord | undefined;
      try {
        [row] = await tx
          .insert(bankTransactions)
          .values({
            tenantId,
            bankAccountId: input.bankAccountId,
            txDate: input.txDate,
            amountEtb: input.amountEtb,
            kind: input.kind,
            description: input.description,
            paymentId: input.paymentId,
            expenseId: input.expenseId,
            recordedByUserId: userId,
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(
            'This payment or expense is already linked to another bank transaction',
          );
        }
        // Defense in depth: bankAccountId/paymentId/expenseId are all
        // pre-checked above with explicit SELECTs, but a well-formed id
        // that stops resolving between that check and this insert (a
        // concurrent soft-delete, for instance) would otherwise 500 here
        // instead of reclassifying the same way every other finance write
        // path with FK inputs now does.
        if (isForeignKeyViolation(err)) {
          throw new NotFoundException('Bank account, payment or expense not found');
        }
        throw err;
      }
      if (!row) {
        throw new Error('Failed to insert bank transaction');
      }
      return row;
    });
  }

  /**
   * R9: bank_transactions is insert-only (see the table's own doc comment)
   * and, until now, had NO correction path at all — the first wrong
   * amount, kind or date hand-keyed from a bank statement was permanent.
   * Mirrors PaymentsRepository.reverse's shape: lock the original (also
   * closes the double-reversal race below), insert a new row with the
   * amount negated and `reversalOfTransactionId` set; the original is
   * NEVER touched. `txDate` is set to TODAY on the reversal — same "the
   * reversal is a new event happening now, not a backdated edit" reasoning
   * as PaymentsRepository.reverse's `receivedAt: new Date()` /
   * ExpensesRepository.reverse's `expenseDate: today`.
   *
   * paymentId/expenseId are deliberately NOT copied onto the reversal row:
   * the partial unique indexes (bank_transactions_payment_uk/_expense_uk,
   * see their own migration) allow at most ONE bank transaction per
   * payment/expense, and the original already holds that slot — copying it
   * here would 409 on the very insert this method exists to make succeed.
   *
   * No "claim a number before the lock" step: unlike invoices/payments/
   * expenses, bank_transactions has no document-sequence number at all
   * (it's a raw statement line, not a numbered document — see banks.ts),
   * so there is nothing to claim. `assertAccountExists` still runs before
   * the lock, same "cheap, uncontended work first" shape the other
   * modules' claim-then-lock order exists to preserve.
   *
   * All THREE guards below run under the advisory lock on the ORIGINAL
   * row's id (same `pg_advisory_xact_lock(hashtext(id)::bigint)` idiom as
   * PaymentsRepository/ExpensesRepository/InvoicesRepository's own copies —
   * 4th+ occurrence, reused verbatim per this codebase's convention):
   *  - target is itself a reversal (`reversalOfTransactionId !== null`):
   *    reversing a reversal would un-reverse the original and double-count
   *    it — same reasoning as PaymentsRepository.reverse's B1a guard (wave
   *    A). Checked FIRST, same order as PaymentsRepository.reverse.
   *  - target is LINKED (paymentId/expenseId set): refused outright, see
   *    this guard's own inline comment below for why — this is NOT the
   *    (b)-shaped fix a scoped re-review asked to prefer; (a) was chosen
   *    instead for a concrete reason documented there.
   *  - already reversed: another row's `reversalOfTransactionId` already
   *    points at this one.
   *
   * The account's `balanceEtb` (BankAccountsRepository — Σ signed
   * amountEtb, unconditional) absorbs a reversal for free: no reversal-
   * aware filter to update, no separate code path to keep in sync.
   */
  async reverse(
    tenantId: string,
    bankAccountId: string,
    transactionId: string,
    userId: string,
    reason: string,
  ): Promise<BankTransactionRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await this.assertAccountExists(tx, bankAccountId);

      await this.lockRow(tx, transactionId);

      const [original] = await tx
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, transactionId),
            eq(bankTransactions.bankAccountId, bankAccountId),
          ),
        )
        .limit(1);
      if (!original) {
        throw new NotFoundException('Bank transaction not found');
      }

      if (original.reversalOfTransactionId !== null) {
        throw new WorkflowTransitionError('Cannot reverse a reversal bank transaction');
      }

      // Fix-wave-c #1 (BLOCKER): reversing a LINKED original was a dead
      // end, not a correction path. The mirror row above nulls out
      // paymentId/expenseId, so the ORIGINAL keeps its slot in
      // bank_transactions_payment_uk/_expense_uk forever (the partial
      // unique index's WHERE predicate can only see this ROW's own
      // columns — a "was I reversed" check needs to see OTHER rows, and
      // Postgres flatly rejects a subquery in an index predicate: `create
      // unique index ... where payment_id is not null and not exists
      // (select 1 from bank_transactions r where ...)` fails with "cannot
      // use subquery in index predicate", verified against a live
      // instance). Freeing the slot without that would mean mutating the
      // ORIGINAL row (a denormalized "reversed" flag, maintained by a
      // trigger since the repository itself grants no UPDATE) — trading
      // the one invariant this whole table exists to guarantee
      // (insert-only, original NEVER touched, see banks.ts's own doc
      // comment) for the ability to reverse a link. That trade is out of
      // scope for this fix. So: refuse up front, loudly (409), rather than
      // let reverse() "succeed" into a row that can never be relinked and
      // a payment/expense that silently vanishes from findUnreconciled
      // forever — the failure mode a scoped re-review flagged as worse
      // than not having a correction path at all. Reverse the linked
      // payment/expense itself instead (PaymentsRepository.reverse /
      // ExpensesRepository.reverse already exist for that).
      if (original.paymentId !== null || original.expenseId !== null) {
        throw new WorkflowTransitionError(
          'This bank transaction is linked to a payment or expense and cannot be reversed directly — reverse the linked payment or expense instead',
        );
      }

      const [existingReversal] = await tx
        .select({ id: bankTransactions.id })
        .from(bankTransactions)
        .where(eq(bankTransactions.reversalOfTransactionId, transactionId))
        .limit(1);
      if (existingReversal) {
        throw new WorkflowTransitionError('This bank transaction has already been reversed');
      }

      const [reversal] = await tx
        .insert(bankTransactions)
        .values({
          tenantId,
          bankAccountId: original.bankAccountId,
          txDate: todayIso(),
          amountEtb: new Decimal(original.amountEtb).negated().toFixed(2),
          kind: original.kind,
          description: original.description,
          paymentId: null,
          expenseId: null,
          recordedByUserId: userId,
          reversalOfTransactionId: original.id,
          reverseReason: reason,
        })
        .returning();
      if (!reversal) {
        throw new Error('Failed to insert reversal bank transaction');
      }
      return reversal;
    });
  }

  async list(
    tenantId: string,
    bankAccountId: string,
    options: BankTransactionListFilter & { page?: string; pageSize?: string },
  ): Promise<PaginatedResult<BankTransactionRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(options.page, options.pageSize);
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await this.assertAccountExists(tx, bankAccountId);
      const where = this.buildListFilter(bankAccountId, options);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(bankTransactions)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(bankTransactions)
        .where(where)
        .orderBy(desc(bankTransactions.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * Streams every bank transaction for this account matching the same
   * filters `list()` honors, for bulk export, in batches of BATCH_SIZE with
   * a PK tiebreaker — same offset-batching shape as ExpensesRepository.streamAll.
   */
  async *streamAll(
    tenantId: string,
    bankAccountId: string,
    options: BankTransactionListFilter,
  ): AsyncGenerator<BankTransactionRecord> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const where = this.buildListFilter(bankAccountId, options);
        return tx
          .select(getTableColumns(bankTransactions))
          .from(bankTransactions)
          .where(where)
          .orderBy(desc(bankTransactions.createdAt), asc(bankTransactions.id))
          .limit(BATCH_SIZE)
          .offset(offset);
      });
      for (const row of batch) {
        yield row;
      }
      if (batch.length < BATCH_SIZE) {
        return;
      }
      offset += BATCH_SIZE;
    }
  }

  /**
   * Two lists, brief 4.6: payments/expenses with this bankAccountId that
   * have no linked bank_transactions row (notExists, not a join — avoids
   * any row-multiplication ambiguity). Each side capped at 200 — NEVER a
   * silent cap: fetch CAP+1, slice to CAP, and whether a (CAP+1)th row came
   * back is exactly the truncation signal.
   */
  async findUnreconciled(tenantId: string, bankAccountId: string): Promise<UnreconciledView> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await this.assertAccountExists(tx, bankAccountId);

      const paymentRows = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.bankAccountId, bankAccountId),
            notExists(
              tx
                .select({ id: bankTransactions.id })
                .from(bankTransactions)
                .where(eq(bankTransactions.paymentId, payments.id)),
            ),
          ),
        )
        .orderBy(desc(payments.receivedAt), asc(payments.id))
        .limit(UNRECONCILED_CAP + 1);

      const expenseRows = await tx
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.bankAccountId, bankAccountId),
            notExists(
              tx
                .select({ id: bankTransactions.id })
                .from(bankTransactions)
                .where(eq(bankTransactions.expenseId, expenses.id)),
            ),
          ),
        )
        .orderBy(desc(expenses.expenseDate), asc(expenses.id))
        .limit(UNRECONCILED_CAP + 1);

      return {
        payments: {
          items: paymentRows.slice(0, UNRECONCILED_CAP),
          truncated: paymentRows.length > UNRECONCILED_CAP,
        },
        expenses: {
          items: expenseRows.slice(0, UNRECONCILED_CAP),
          truncated: expenseRows.length > UNRECONCILED_CAP,
        },
      };
    });
  }

  private buildListFilter(bankAccountId: string, options: BankTransactionListFilter) {
    const filters = [eq(bankTransactions.bankAccountId, bankAccountId)];
    if (options.from) {
      filters.push(gte(bankTransactions.txDate, options.from));
    }
    if (options.to) {
      filters.push(lte(bankTransactions.txDate, options.to));
    }
    return and(...filters);
  }

  private async assertAccountExists(tx: TenantTransaction, bankAccountId: string): Promise<void> {
    const [account] = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, bankAccountId))
      .limit(1);
    if (!account) {
      throw new NotFoundException('Bank account not found');
    }
  }

  /** `pg_advisory_xact_lock(hashtext(id)::bigint)` — see PaymentsRepository/ExpensesRepository/InvoicesRepository's own copies of the same idiom (4th+ occurrence, reused verbatim per this codebase's convention). */
  private async lockRow(tx: TenantTransaction, id: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}::text)::bigint)`);
  }
}
