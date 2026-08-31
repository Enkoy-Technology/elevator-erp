import { and, eq, inArray, ne, sum } from 'drizzle-orm';
import { Decimal } from 'decimal.js';

import type { TenantTransaction } from '../database/database.types';
import { customers, invoices, paymentAllocations, payments } from '../database/schema';

/**
 * Recomputes and stores `customers.outstandingBalanceEtb` — the customer's
 * NET ACCOUNT POSITION, not a per-invoice sum:
 *
 *   Σ over non-VOID invoices of (totalEtb − whtEtb − Σ allocations)
 *   − Σ over LIVE payments of (amountEtb − Σ that payment's own allocations)
 *
 * The second term is unapplied cash: money the customer has paid that is not
 * (yet, or ever) allocated to any invoice — advance/on-account payments are
 * explicitly legal (partial/empty allocation is a normal path, per the
 * brief). Without that term, every per-invoice contribution in the first sum
 * is structurally >= 0 (every write path enforces allocations + wht <=
 * total), so the aggregate could never go negative, and a customer who has
 * paid in advance would still show as owing — wrong on its face for a field
 * a finance officer reads as "what does this account net to". A negative
 * result here means the customer is in credit; it is deliberately NOT
 * floored at 0, since that credit is a real, visible fact, not a data error.
 *
 * "Live payments" — read from how reversal rows are represented (see
 * `payments`' own schema doc comment): a reversal is never a mutation of the
 * original row, it is a SECOND row with `reversalOfPaymentId` pointing at
 * the original, and "was this payment reversed" is INFERRED from whether
 * any other row points at it — there is no `status`/`isReversed` column. A
 * live payment is therefore one that (a) is not itself a reversal
 * (`reversalOfPaymentId IS NULL`) and (b) has not itself been reversed (no
 * other payment's `reversalOfPaymentId` points at it). Both sides of a
 * reversed pair are excluded rather than relying on an unfiltered sum
 * happening to net to zero: `reverse()` mirrors every one of the original's
 * allocations today, so an unfiltered sum is currently equivalent, but that
 * is a coincidence of today's all-or-nothing reversal, not a contract this
 * function should quietly depend on.
 *
 * IMPORTANT — this deliberately disagrees with `InvoicesRepository.agingReport`,
 * which stays per-invoice (no unapplied-cash term) because unapplied cash
 * has no invoice to be "aged" against. The two totals will legitimately
 * differ by exactly the customer's unapplied cash — that is by design, not
 * a bug (see `agingReport`'s own doc comment for the same note from the
 * other side). Any UI/export surfacing both must label them distinctly
 * (e.g. "Net Balance" vs "Aged Outstanding") — never "Outstanding Balance"
 * for both, which is exactly what let them silently disagree before.
 *
 * Lives in /common rather than invoices/ or payments/ because both modules
 * must call it from inside their own transactions right after writing a
 * money-moving row (invoice issue/void, allocation insert, WHT record,
 * payment reversal), and CLAUDE.md forbids importing one feature module
 * into another — same reasoning as InvoicesRepository reading `customers`/
 * `proformas`/`rateVersions` directly instead of composing those modules'
 * own repositories.
 *
 * Four small queries (invoices, their allocations, this customer's
 * payments, those payments' allocations) rather than one grouped join:
 * simpler to reason about and test than relying on Postgres's
 * functional-dependency GROUP BY rules, and this runs per customer, not
 * per tenant, so the row counts are small.
 *
 * ponytail: recompute-on-write is O(invoices + payments for this customer)
 * per write, and two concurrent writes touching DIFFERENT invoices/payments
 * of the SAME customer (no shared lock between them) can race the final
 * UPDATE to a transiently stale value — it self-heals on the next write to
 * this customer. A nightly reconciliation job asserting stored == derived is
 * the real fix; it lands with the Phase 5 scheduler.
 */
export async function recomputeCustomerBalance(
  tx: TenantTransaction,
  tenantId: string,
  customerId: string,
): Promise<string> {
  const openInvoices = await tx
    .select({
      id: invoices.id,
      totalEtb: invoices.totalEtb,
      whtEtb: invoices.whtEtb,
    })
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId), ne(invoices.status, 'VOID')));

  const allocatedByInvoice = new Map<string, string>();
  if (openInvoices.length > 0) {
    const allocationSums = await tx
      .select({
        invoiceId: paymentAllocations.invoiceId,
        total: sum(paymentAllocations.amountEtb),
      })
      .from(paymentAllocations)
      .where(
        inArray(
          paymentAllocations.invoiceId,
          openInvoices.map((invoice) => invoice.id),
        ),
      )
      .groupBy(paymentAllocations.invoiceId);
    for (const row of allocationSums) {
      allocatedByInvoice.set(row.invoiceId, row.total ?? '0');
    }
  }

  const invoicedBalance = openInvoices.reduce((sumSoFar, invoice) => {
    const allocated = allocatedByInvoice.get(invoice.id) ?? '0';
    return sumSoFar.plus(
      new Decimal(invoice.totalEtb).minus(invoice.whtEtb).minus(allocated),
    );
  }, new Decimal(0));

  // Unapplied cash — see this function's own doc comment for the exact
  // "live payment" definition (excludes BOTH sides of a reversed pair).
  const customerPayments = await tx
    .select({
      id: payments.id,
      amountEtb: payments.amountEtb,
      reversalOfPaymentId: payments.reversalOfPaymentId,
    })
    .from(payments)
    .where(eq(payments.customerId, customerId));

  const reversedPaymentIds = new Set(
    customerPayments
      .map((payment) => payment.reversalOfPaymentId)
      .filter((id): id is string => id !== null),
  );
  const livePayments = customerPayments.filter(
    (payment) =>
      payment.reversalOfPaymentId === null && !reversedPaymentIds.has(payment.id),
  );

  const allocatedByPayment = new Map<string, string>();
  if (livePayments.length > 0) {
    const paymentAllocationSums = await tx
      .select({
        paymentId: paymentAllocations.paymentId,
        total: sum(paymentAllocations.amountEtb),
      })
      .from(paymentAllocations)
      .where(
        inArray(
          paymentAllocations.paymentId,
          livePayments.map((payment) => payment.id),
        ),
      )
      .groupBy(paymentAllocations.paymentId);
    for (const row of paymentAllocationSums) {
      allocatedByPayment.set(row.paymentId, row.total ?? '0');
    }
  }

  const unappliedCash = livePayments.reduce((sumSoFar, payment) => {
    const allocated = allocatedByPayment.get(payment.id) ?? '0';
    return sumSoFar.plus(new Decimal(payment.amountEtb).minus(allocated));
  }, new Decimal(0));

  const balance = invoicedBalance.minus(unappliedCash).toFixed(2);

  // Explicit tenantId predicate, belt-and-suspenders alongside RLS (which
  // already scopes this UPDATE to the current tenant on its own) — matches
  // the composite-PK shape every tenant table is queried by elsewhere.
  await tx
    .update(customers)
    .set({ outstandingBalanceEtb: balance, updatedAt: new Date() })
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)));

  return balance;
}
