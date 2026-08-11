import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, asc, count, desc, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import { isForeignKeyViolation } from '../../common/db-errors';
import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import type { TenantTransaction } from '../../database/database.types';
import {
  documentSequences,
  expenses,
  tenants,
  type ExpenseCategory,
  type PaymentMethod,
  type SupplyKind,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { buildExpenseNumber } from './expense-number';

export type ExpenseRecord = typeof expenses.$inferSelect;
/**
 * `netPayableEtb` (= amountEtb − whtEtb, "cash actually paid") is computed
 * on every read, never stored — see the brief's own reasoning (storing it
 * invites drift once whtEtb is anything other than what produced it).
 */
export type ExpenseWithNetPayable = ExpenseRecord & { netPayableEtb: string };

/** `document_sequences.kind` for this document type — see the table's own doc comment. */
const EXPENSE_SEQUENCE_KIND = 'EXPENSE';

export interface RecordExpenseInput {
  supplierName: string;
  supplierTin: string | null;
  supplierLicenceOnFile: boolean;
  supplyKind: SupplyKind;
  category: ExpenseCategory;
  expenseDate: string;
  paidVia: PaymentMethod;
  bankAccountId: string | null;
  /** Pre-VAT amount WHT is computed on. */
  netAmountEtb: string;
  vatEtb: string;
  /** Gross — what the supplier was actually billed. */
  amountEtb: string;
  whtRatePercent: string;
  whtEtb: string;
  /** Always set — the WHT rate_versions row that made the decision, even at 0%. */
  rateVersionId: string;
  description: string | null;
  reference: string | null;
}

export interface ExpenseListFilter {
  category?: ExpenseCategory;
  supplyKind?: SupplyKind;
  from?: string;
  to?: string;
  q?: string;
}

const withNetPayable = (row: ExpenseRecord): ExpenseWithNetPayable => ({
  ...row,
  netPayableEtb: new Decimal(row.amountEtb).minus(row.whtEtb).toFixed(2),
});

@Injectable()
export class ExpensesRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Records an expense in ONE transaction: claim the gapless EXP-{fy}-{seq}
   * number, insert. All money/WHT math is already done by ExpensesService
   * (expense-money.ts / wht-decision.ts, no DB access needed) — this method
   * only owns the transaction-bound protocol, same division of labour as
   * InvoicesRepository.createStandalone.
   *
   * Lock order note (R2): this method claims its number the same way
   * `record()` does everywhere else in finance (PaymentsRepository.record),
   * but — unlike payments/invoices — takes NO advisory lock at all, so
   * there is no "sequence -> ... -> advisory lock" ordering to keep
   * consistent here. That absence is exactly what makes this method safe
   * today: nothing else in this codebase locks by expenseId before this
   * runs, so there is no second lock to acquire in the wrong order against.
   * If a lock is ever added here (e.g. a future correction workflow), it
   * MUST be taken AFTER the claim, matching PaymentsRepository.record/
   * reverse's sequence -> payment -> invoices order.
   *
   * R8 (ACCEPTED, not a bug): `fiscalYearLabel` below is computed from
   * TODAY — the moment this expense is being claimed/keyed in — never from
   * `input.expenseDate`, even though `expenseDate` is user-supplied and can
   * legitimately be backdated (a bill dated 2026-07-05 keyed in on
   * 2026-07-10, say). This is deliberate: gapless per-fiscal-year numbering
   * (EXP-{fy}-{seq}) has to claim against whichever fiscal year is OPEN
   * right now — computing it from a possibly-backdated `expenseDate`
   * instead would either collide with a year whose sequence has already
   * moved on, or leave a gap in a year that's already closed. So
   * `fiscalYearLabel` is a NUMBERING-SERIES artifact, not a reporting
   * field: any fiscal-year report MUST group by `expenseDate` — the
   * real-world date the expense happened — NEVER by `fiscalYearLabel`.
   * PaymentsRepository.claimReceiptNumber carries the identical note for
   * `receivedAt`/receipts.
   */
  async record(
    tenantId: string,
    userId: string,
    input: RecordExpenseInput,
  ): Promise<ExpenseWithNetPayable> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const today = todayIso();
      const fiscalYear = await this.fiscalYearForToday(tx, tenantId, today);
      const claimed = await this.claimSequence(tx, tenantId, fiscalYear.label);
      const expenseNumber = buildExpenseNumber(fiscalYear.label, claimed);

      let row: ExpenseRecord | undefined;
      try {
        [row] = await tx
          .insert(expenses)
          .values({
            tenantId,
            expenseNumber,
            fiscalYearLabel: fiscalYear.label,
            category: input.category,
            supplyKind: input.supplyKind,
            supplierName: input.supplierName,
            supplierTin: input.supplierTin,
            supplierLicenceOnFile: input.supplierLicenceOnFile,
            netAmountEtb: input.netAmountEtb,
            vatEtb: input.vatEtb,
            amountEtb: input.amountEtb,
            whtRatePercent: input.whtRatePercent,
            whtEtb: input.whtEtb,
            rateVersionId: input.rateVersionId,
            paidVia: input.paidVia,
            bankAccountId: input.bankAccountId,
            expenseDate: input.expenseDate,
            description: input.description,
            reference: input.reference,
            recordedByUserId: userId,
          })
          .returning();
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw new NotFoundException('Bank account not found');
        }
        throw err;
      }
      if (!row) {
        throw new Error('Failed to insert expense');
      }
      return withNetPayable(row);
    });
  }

  /**
   * Reverses an expense: immutable ledger, so the original row is NEVER
   * touched (see expenses.ts's own doc comment — `status` labels a row as
   * itself being a reversal, it is never flipped on the original). Instead,
   * in one transaction: claim the reversal's own number, lock the original
   * (also closes the double-reversal race below), insert a new expense row
   * with every money column negated, `status: 'REVERSED'` and
   * `reversalOfExpenseId` set. Non-money fields (supplier*, category,
   * supplyKind, paidVia, bankAccountId, rateVersionId, whtRatePercent,
   * description, reference) are copied verbatim from the original — same as
   * PaymentsRepository.reverse copying method/bankAccountId/reference/note.
   * `expenseDate` is set to TODAY on the reversal (mirrors
   * PaymentsRepository.reverse's `receivedAt: new Date()`) — the reversal is
   * a new event happening now, not a backdated edit of the original's date.
   *
   * Lock order (consistency fix): claim the number BEFORE the advisory lock
   * — same "sequence -> row" order as PaymentsRepository.record/reverse,
   * and the inverse of what this method used to do (lock first, claim
   * last). `record()` above takes no advisory lock at all today, so this
   * ordering is not YET load-bearing here the way it is in
   * PaymentsRepository (two reverse() calls can't deadlock against a
   * record() that never locks anything) — see `record()`'s own "Lock order
   * note (R2)" doc comment for why that absence is itself the safety
   * argument today, and why a future lock in `record()` MUST land after its
   * own claim. This method still follows the shared order regardless, so
   * the whole finance module has ONE lock-order rule, not one that only
   * some methods honour.
   *
   * Reversal-of-a-reversal guard: `original.reversalOfExpenseId !== null`
   * means the row this call is being asked to reverse is ALREADY a negated
   * mirror of some other expense — same B1a guard as PaymentsRepository.
   * reverse / BankTransactionsRepository.reverse, checked FIRST, same order.
   * Expenses have no allocations, so the arithmetic happens to net to zero
   * either way — but without this guard, reversing a reversal produces a
   * row with POSITIVE money columns and `status: 'REVERSED'`. Any future
   * report that filters `status = 'REVERSED'` out would then exclude that
   * re-instated row while including the original/first-reversal pair that
   * nets to zero, silently reporting a real expense as 0.00.
   *
   * Double-reversal guard: same read-then-insert race as
   * PaymentsRepository.reverse — the advisory lock on the ORIGINAL row's id
   * serializes two concurrent reverse() calls against the same original so
   * only one can pass the "already reversed?" check.
   */
  async reverse(
    tenantId: string,
    expenseId: string,
    userId: string,
    reason: string,
  ): Promise<ExpenseWithNetPayable> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const today = todayIso();
      const fiscalYear = await this.fiscalYearForToday(tx, tenantId, today);
      const claimed = await this.claimSequence(tx, tenantId, fiscalYear.label);
      const expenseNumber = buildExpenseNumber(fiscalYear.label, claimed);

      await this.lockRow(tx, expenseId);

      const [original] = await tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseId))
        .limit(1);
      if (!original) {
        throw new NotFoundException('Expense not found');
      }

      if (original.reversalOfExpenseId !== null) {
        throw new WorkflowTransitionError('Cannot reverse a reversal expense');
      }

      const [existingReversal] = await tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.reversalOfExpenseId, expenseId))
        .limit(1);
      if (existingReversal) {
        throw new WorkflowTransitionError('This expense has already been reversed');
      }

      const [reversal] = await tx
        .insert(expenses)
        .values({
          tenantId,
          expenseNumber,
          fiscalYearLabel: fiscalYear.label,
          category: original.category,
          supplyKind: original.supplyKind,
          supplierName: original.supplierName,
          supplierTin: original.supplierTin,
          supplierLicenceOnFile: original.supplierLicenceOnFile,
          netAmountEtb: new Decimal(original.netAmountEtb).negated().toFixed(2),
          vatEtb: new Decimal(original.vatEtb).negated().toFixed(2),
          amountEtb: new Decimal(original.amountEtb).negated().toFixed(2),
          whtRatePercent: original.whtRatePercent,
          whtEtb: new Decimal(original.whtEtb).negated().toFixed(2),
          rateVersionId: original.rateVersionId,
          paidVia: original.paidVia,
          bankAccountId: original.bankAccountId,
          expenseDate: today,
          description: original.description,
          reference: original.reference,
          recordedByUserId: userId,
          status: 'REVERSED',
          reversalOfExpenseId: original.id,
          reverseReason: reason,
        })
        .returning();
      if (!reversal) {
        throw new Error('Failed to insert reversal expense');
      }
      return withNetPayable(reversal);
    });
  }

  async list(
    tenantId: string,
    options: ExpenseListFilter & { page?: string; pageSize?: string },
  ): Promise<PaginatedResult<ExpenseWithNetPayable>> {
    const { page, pageSize, offset } = normalizePageQuery(options.page, options.pageSize);
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const where = this.buildListFilter(options);
      const [totalRow] = await tx.select({ value: count() }).from(expenses).where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(expenses)
        .where(where)
        .orderBy(desc(expenses.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items.map(withNetPayable), total, page, pageSize);
    });
  }

  /**
   * Streams every expense matching the same filters `list()` honors, for
   * bulk export, in batches of BATCH_SIZE with a PK tiebreaker — same
   * offset-batching shape as InvoicesRepository.streamAll (ponytail: same
   * ceiling, same upgrade path — keyset cursor before this feeds real
   * tenant-scale reconciliation).
   */
  async *streamAll(
    tenantId: string,
    options: ExpenseListFilter,
  ): AsyncGenerator<ExpenseWithNetPayable> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const where = this.buildListFilter(options);
        return tx
          .select(getTableColumns(expenses))
          .from(expenses)
          .where(where)
          .orderBy(desc(expenses.createdAt), asc(expenses.id))
          .limit(BATCH_SIZE)
          .offset(offset);
      });
      for (const row of batch) {
        yield withNetPayable(row);
      }
      if (batch.length < BATCH_SIZE) {
        return;
      }
      offset += BATCH_SIZE;
    }
  }

  async findById(tenantId: string, id: string): Promise<ExpenseWithNetPayable | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      return row ? withNetPayable(row) : null;
    });
  }

  private buildListFilter(options: ExpenseListFilter) {
    const filters = [];
    if (options.category) {
      filters.push(eq(expenses.category, options.category));
    }
    if (options.supplyKind) {
      filters.push(eq(expenses.supplyKind, options.supplyKind));
    }
    if (options.from) {
      filters.push(gte(expenses.expenseDate, options.from));
    }
    if (options.to) {
      filters.push(lte(expenses.expenseDate, options.to));
    }
    if (options.q && options.q.trim().length > 0) {
      // Plain LIKE, not the Ethiopic-normalized helper (brief 4.3) — there
      // is no normalized column for supplier names yet. An Amharic supplier
      // name typed one way and searched another will silently return
      // nothing (see docs/planning/DECISIONS-platform-and-ethiopian-compliance.md
      // §2) until a follow-up applies the Phase 2 normalization treatment
      // here, the same treatment customers.name already got.
      const pattern = `%${options.q.trim().toLowerCase()}%`;
      filters.push(sql`lower(${expenses.supplierName}) like ${pattern}`);
    }
    return filters.length > 0 ? and(...filters) : undefined;
  }

  /** `pg_advisory_xact_lock(hashtext(id)::bigint)` — see PaymentsRepository.lockRow / InvoicesRepository.lockInvoice for the same idiom (3rd+ occurrence, reused verbatim per the task brief). */
  private async lockRow(tx: TenantTransaction, id: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}::text)::bigint)`);
  }

  private async fiscalYearForToday(tx: TenantTransaction, tenantId: string, today: string) {
    const [tenant] = await tx
      .select({ fiscalYearStart: tenants.fiscalYearStart })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return computeFiscalYear(today, tenant.fiscalYearStart);
  }

  /** Claims the next gapless number for (tenant, EXPENSE, fiscal year) — atomic upsert, same as InvoicesRepository.claimSequence. */
  private async claimSequence(
    tx: TenantTransaction,
    tenantId: string,
    fiscalYearLabel: string,
  ): Promise<number> {
    const [claimed] = await tx
      .insert(documentSequences)
      .values({
        tenantId,
        kind: EXPENSE_SEQUENCE_KIND,
        fiscalYearLabel,
        lastValue: 1,
      })
      .onConflictDoUpdate({
        target: [
          documentSequences.tenantId,
          documentSequences.kind,
          documentSequences.fiscalYearLabel,
        ],
        set: { lastValue: sql`${documentSequences.lastValue} + 1` },
      })
      .returning({ lastValue: documentSequences.lastValue });
    if (!claimed) {
      throw new Error('Failed to claim expense number');
    }
    return claimed.lastValue;
  }
}
