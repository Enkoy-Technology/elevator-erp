import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, eq, getTableColumns, sql, sum } from 'drizzle-orm';

import { recomputeCustomerBalance } from '../../common/customer-balance';
import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import { todayIso } from '../../common/business-time';
import type { TenantTransaction } from '../../database/database.types';
import {
  customers,
  documentSequences,
  invoices,
  payments,
  paymentAllocations,
  tenants,
  type PaymentMethod,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { InvoicesRepository } from '../invoices/invoices.repository';
import type { PaymentDocumentRow } from './receipt-document.mapper';
import { buildReceiptNumber } from './receipt-number';

export type PaymentRecord = typeof payments.$inferSelect;
export type PaymentAllocationRecord = typeof paymentAllocations.$inferSelect;
export type PaymentWithAllocations = PaymentRecord & {
  allocations: PaymentAllocationRecord[];
};

/** `document_sequences.kind` for this document type — see the table's own doc comment. */
const RECEIPT_SEQUENCE_KIND = 'RECEIPT';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Postgres `unique_violation`, reclassified as a 409 instead of an
 * unhandled 500 — same shape (and same reason: drizzle-orm's node-postgres
 * driver puts the real `.code` on `.cause`, not on the thrown error itself)
 * as InvoicesRepository's own copy of this helper. Duplicated rather than
 * shared: this is only the 2nd occurrence codebase-wide — the advisory-lock
 * idiom's own "reuse verbatim" rule only kicks in at the 3rd+ occurrence
 * (see the task brief).
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (v: unknown): string | undefined =>
    typeof v === 'object' && v !== null ? (v as { code?: string }).code : undefined;
  return (
    code(err) === PG_UNIQUE_VIOLATION ||
    code((err as { cause?: unknown } | null)?.cause) === PG_UNIQUE_VIOLATION
  );
}

export interface RecordPaymentInput {
  customerId: string;
  amountEtb: string;
  method: PaymentMethod;
  receivedAt?: string;
  bankAccountId?: string;
  reference?: string;
  note?: string;
  allocations?: { invoiceId: string; amountEtb: string }[];
}

@Injectable()
export class PaymentsRepository {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly invoicesRepository: InvoicesRepository,
  ) {}

  /**
   * Records a receipt and (optionally) allocates it against one or more
   * invoices, in ONE transaction: claim the receipt number, insert the
   * payment, then run each allocation through the same guarded insert
   * `allocate()` uses, and finally recompute the customer's balance.
   * Unallocated payments are legal (advance/on-account) — `allocations` may
   * be empty or omitted entirely.
   */
  async record(
    tenantId: string,
    userId: string,
    input: RecordPaymentInput,
  ): Promise<PaymentWithAllocations> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const receiptNumber = await this.claimReceiptNumber(tx, tenantId);

      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId,
          receiptNumber: receiptNumber.number,
          fiscalYearLabel: receiptNumber.fiscalYearLabel,
          customerId: input.customerId,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
          amountEtb: input.amountEtb,
          method: input.method,
          bankAccountId: input.bankAccountId ?? null,
          reference: input.reference ?? null,
          note: input.note ?? null,
          receivedByUserId: userId,
        })
        .returning();
      if (!payment) {
        throw new Error('Failed to insert payment');
      }

      const allocations: PaymentAllocationRecord[] = [];
      for (const alloc of input.allocations ?? []) {
        allocations.push(
          await this.guardAndInsertAllocation(
            tx,
            tenantId,
            payment,
            alloc.invoiceId,
            alloc.amountEtb,
          ),
        );
      }

      await recomputeCustomerBalance(tx, tenantId, input.customerId);

      return { ...payment, allocations };
    });
  }

  /**
   * Payment + joined customer display name + allocations (each joined to
   * its invoice's display number) + the original receipt number when this
   * IS a reversal, for the receipt document download (`receipt` PDF/docx
   * template). Three small queries scoped to one payment — same "small,
   * bounded result sets" reasoning as ProformasRepository/
   * InvoicesRepository's own findByIdForDocument, rather than one wide join.
   */
  async findByIdForDocument(
    tenantId: string,
    id: string,
  ): Promise<PaymentDocumentRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          ...getTableColumns(payments),
          customerName: customers.name,
        })
        .from(payments)
        .leftJoin(
          customers,
          and(eq(payments.tenantId, customers.tenantId), eq(payments.customerId, customers.id)),
        )
        .where(eq(payments.id, id))
        .limit(1);
      const payment = rows[0];
      if (!payment) {
        return null;
      }

      const allocationRows = await tx
        .select({
          amountEtb: paymentAllocations.amountEtb,
          invoiceNumber: invoices.invoiceNumber,
        })
        .from(paymentAllocations)
        .leftJoin(
          invoices,
          and(
            eq(paymentAllocations.tenantId, invoices.tenantId),
            eq(paymentAllocations.invoiceId, invoices.id),
          ),
        )
        .where(eq(paymentAllocations.paymentId, id));

      let originalReceiptNumber: string | null = null;
      if (payment.reversalOfPaymentId) {
        const [original] = await tx
          .select({ receiptNumber: payments.receiptNumber })
          .from(payments)
          .where(eq(payments.id, payment.reversalOfPaymentId))
          .limit(1);
        originalReceiptNumber = original?.receiptNumber ?? null;
      }

      return {
        receiptNumber: payment.receiptNumber,
        receivedAt: payment.receivedAt,
        customerName: payment.customerName,
        amountEtb: payment.amountEtb,
        method: payment.method,
        reference: payment.reference,
        allocations: allocationRows,
        originalReceiptNumber,
      };
    });
  }

  /**
   * Allocates an EXISTING payment against an invoice — same guards as
   * `record()`'s per-allocation loop (advisory lock, over-allocation 409,
   * customer match, non-VOID invoice), reused verbatim via
   * `guardAndInsertAllocation` so the two entry points can never drift
   * apart on the invariant.
   */
  async allocate(
    tenantId: string,
    paymentId: string,
    invoiceId: string,
    amountEtb: string,
  ): Promise<PaymentAllocationRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const row = await this.guardAndInsertAllocation(
        tx,
        tenantId,
        payment,
        invoiceId,
        amountEtb,
      );
      await recomputeCustomerBalance(tx, tenantId, payment.customerId);
      return row;
    });
  }

  /**
   * Reverses a payment: immutable ledger, so the original row is NEVER
   * touched. Instead, in one transaction: lock the original (also closes
   * the double-reversal race below), insert a new payment row with the
   * negated amount, its own claimed receipt number, and
   * `reversalOfPaymentId` set, then insert a negative mirror of every one
   * of the original's allocations and recompute each affected invoice's
   * status. `payments.amountEtb`/`payment_allocations.amountEtb` are plain
   * `numeric(14,2)` with no positive-only CHECK constraint (confirmed
   * against the finance schema migration), so negative rows need no schema
   * change.
   *
   * Double-reversal guard: "check for an existing row referencing it" is a
   * read-then-insert race exactly like the allocation over-allocation guard
   * — two concurrent reverse calls for the same original could both pass
   * the check before either commits. The lock below (same
   * `pg_advisory_xact_lock(hashtext(id)::bigint)` idiom, keyed by the
   * ORIGINAL payment's id) serializes them, same reasoning as the
   * per-invoice lock in `guardAndInsertAllocation`.
   */
  async reverse(
    tenantId: string,
    paymentId: string,
    userId: string,
    reason: string,
  ): Promise<PaymentWithAllocations> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await this.lockRow(tx, paymentId);

      const [original] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);
      if (!original) {
        throw new NotFoundException('Payment not found');
      }

      const [existingReversal] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.reversalOfPaymentId, paymentId))
        .limit(1);
      if (existingReversal) {
        throw new WorkflowTransitionError('This payment has already been reversed');
      }

      const originalAllocations = await tx
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));

      // Lock every affected invoice too, in ascending id order. Reversal
      // never INCREASES Σ allocations for an invoice (mirrors are negated),
      // so it can't itself trigger the over-allocation invariant — but it
      // does write payment_allocations and call recomputePaymentStatus,
      // which CASes off a status it just read. Without a lock, that read
      // and a concurrent allocate() call's own CAS on the same invoice can
      // interleave under READ COMMITTED and make one of the two fail with
      // an unhandled "Failed to CAS" error for what should be a perfectly
      // valid operation — the same write-skew class the invoice lock in
      // guardAndInsertAllocation exists to prevent. Sorted so a reversal
      // and a concurrent allocate/reverse touching an overlapping invoice
      // set always acquire locks in the same relative order (payment
      // first, invoices ascending) and can never deadlock against it.
      const invoiceIds = [...new Set(originalAllocations.map((a) => a.invoiceId))].sort();
      for (const invoiceId of invoiceIds) {
        await this.lockRow(tx, invoiceId);
      }

      const receiptNumber = await this.claimReceiptNumber(tx, tenantId);
      const [reversal] = await tx
        .insert(payments)
        .values({
          tenantId,
          receiptNumber: receiptNumber.number,
          fiscalYearLabel: receiptNumber.fiscalYearLabel,
          customerId: original.customerId,
          receivedAt: new Date(),
          amountEtb: new Decimal(original.amountEtb).negated().toFixed(2),
          method: original.method,
          bankAccountId: original.bankAccountId,
          reference: original.reference,
          note: original.note,
          receivedByUserId: userId,
          reversalOfPaymentId: original.id,
          reverseReason: reason,
        })
        .returning();
      if (!reversal) {
        throw new Error('Failed to insert reversal payment');
      }

      const mirrorAllocations: PaymentAllocationRecord[] = [];
      for (const alloc of originalAllocations) {
        const [row] = await tx
          .insert(paymentAllocations)
          .values({
            tenantId,
            paymentId: reversal.id,
            invoiceId: alloc.invoiceId,
            amountEtb: new Decimal(alloc.amountEtb).negated().toFixed(2),
          })
          .returning();
        if (!row) {
          throw new Error('Failed to insert reversal allocation mirror');
        }
        mirrorAllocations.push(row);
        await this.invoicesRepository.recomputePaymentStatus(tx, alloc.invoiceId);
      }

      await recomputeCustomerBalance(tx, tenantId, original.customerId);

      return { ...reversal, allocations: mirrorAllocations };
    });
  }

  /**
   * Shared guard + insert for both `record()`'s allocation loop and
   * `allocate()`: locks (payment, then invoice — see the lock-order comment
   * in `reverse()`), checks the invoice exists/is non-VOID/matches the
   * payment's customer, checks BOTH invariants the brief requires —
   * Σ existing invoice allocations + whtEtb + new ≤ invoice.totalEtb, and
   * Σ existing payment allocations + new ≤ payment.amountEtb — as 409s
   * (never a silent clamp), then inserts and recomputes the invoice's
   * payment status in the same transaction.
   *
   * Locking `payment.id` here is a no-op for `record()` (a payment just
   * inserted in THIS transaction has no id any other transaction can yet
   * reference) but a real guard for `allocate()`, where two concurrent
   * allocate() calls against the SAME existing payment but DIFFERENT
   * invoices would otherwise both read the same "already allocated" total
   * and both pass the payment-total check — the identical write-skew shape
   * as the per-invoice race, just keyed by payment instead of invoice.
   * Sharing the code path means both call sites get both locks for free.
   */
  private async guardAndInsertAllocation(
    tx: TenantTransaction,
    tenantId: string,
    payment: Pick<PaymentRecord, 'id' | 'customerId' | 'amountEtb'>,
    invoiceId: string,
    amountEtb: string,
  ): Promise<PaymentAllocationRecord> {
    await this.lockRow(tx, payment.id);
    await this.lockRow(tx, invoiceId);

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status === 'VOID') {
      throw new WorkflowTransitionError('Cannot allocate a payment to a VOID invoice');
    }
    if (invoice.customerId !== payment.customerId) {
      throw new WorkflowTransitionError(
        'Invoice belongs to a different customer than this payment',
      );
    }

    const [invoiceAllocated] = await tx
      .select({ total: sum(paymentAllocations.amountEtb) })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.invoiceId, invoiceId));
    const invoiceAllocatedEtb = invoiceAllocated?.total ?? '0';
    const invoiceSettledAfter = new Decimal(invoiceAllocatedEtb)
      .plus(invoice.whtEtb)
      .plus(amountEtb);
    if (invoiceSettledAfter.gt(invoice.totalEtb)) {
      throw new WorkflowTransitionError(
        `Allocating ${amountEtb} plus the ${invoiceAllocatedEtb} already allocated and ${invoice.whtEtb} withheld would exceed invoice total of ${invoice.totalEtb}`,
      );
    }

    const [paymentAllocated] = await tx
      .select({ total: sum(paymentAllocations.amountEtb) })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, payment.id));
    const paymentAllocatedEtb = paymentAllocated?.total ?? '0';
    const paymentTotalAfter = new Decimal(paymentAllocatedEtb).plus(amountEtb);
    if (paymentTotalAfter.gt(payment.amountEtb)) {
      throw new WorkflowTransitionError(
        `Allocating ${amountEtb} would bring this payment's total allocations to ${paymentTotalAfter.toFixed(2)}, exceeding its own amount of ${payment.amountEtb}`,
      );
    }

    let row: PaymentAllocationRecord | undefined;
    try {
      [row] = await tx
        .insert(paymentAllocations)
        .values({ tenantId, paymentId: payment.id, invoiceId, amountEtb })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('This payment has already been allocated to this invoice');
      }
      throw err;
    }
    if (!row) {
      throw new Error('Failed to insert payment allocation');
    }

    await this.invoicesRepository.recomputePaymentStatus(tx, invoiceId);

    return row;
  }

  /** `pg_advisory_xact_lock(hashtext(id)::bigint)` — see rates.repository.ts / employees.repository.ts / invoices.repository.ts for the same idiom (3rd+ occurrence, reused verbatim per the task brief). */
  private async lockRow(tx: TenantTransaction, id: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}::text)::bigint)`);
  }

  /** Claims the next gapless RCT-{fy}-{seq} number for today's fiscal year — same claim protocol as invoice/proforma numbering. */
  private async claimReceiptNumber(
    tx: TenantTransaction,
    tenantId: string,
  ): Promise<{ number: string; fiscalYearLabel: string }> {
    const today = todayIso();
    const [tenant] = await tx
      .select({ fiscalYearStart: tenants.fiscalYearStart })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const fiscalYear = computeFiscalYear(today, tenant.fiscalYearStart);

    const [claimed] = await tx
      .insert(documentSequences)
      .values({
        tenantId,
        kind: RECEIPT_SEQUENCE_KIND,
        fiscalYearLabel: fiscalYear.label,
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
      throw new Error('Failed to claim receipt number');
    }
    return {
      number: buildReceiptNumber(fiscalYear.label, claimed.lastValue),
      fiscalYearLabel: fiscalYear.label,
    };
  }
}
