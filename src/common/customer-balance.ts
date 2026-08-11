import { and, eq, inArray, ne, sum } from 'drizzle-orm';
import { Decimal } from 'decimal.js';

import type { TenantTransaction } from '../database/database.types';
import { customers, invoices, paymentAllocations } from '../database/schema';

/**
 * Recomputes and stores `customers.outstandingBalanceEtb` from source of
 * truth: Σ over non-VOID invoices of (totalEtb − whtEtb − Σ allocations for
 * that invoice). Deliberately NOT floored at 0 — a negative result means the
 * customer is in credit (advance payments exceed what they currently owe),
 * which is a real, visible fact, not a data error.
 *
 * Lives in /common rather than invoices/ or payments/ because both modules
 * must call it from inside their own transactions right after writing a
 * money-moving row (invoice issue/void, allocation insert, WHT record,
 * payment reversal), and CLAUDE.md forbids importing one feature module
 * into another — same reasoning as InvoicesRepository reading `customers`/
 * `proformas`/`rateVersions` directly instead of composing those modules'
 * own repositories.
 *
 * Two queries (invoices, then their allocations) rather than one grouped
 * join: simpler to reason about and test than relying on Postgres's
 * functional-dependency GROUP BY rules, and this runs per customer, not
 * per tenant, so the row counts are small.
 *
 * ponytail: recompute-on-write is O(invoices for this customer) per write,
 * and two concurrent writes touching DIFFERENT invoices of the SAME
 * customer (no shared lock between them) can race the final UPDATE to a
 * transiently stale value — it self-heals on the next write to this
 * customer. A nightly reconciliation job asserting stored == derived is the
 * real fix; it lands with the Phase 5 scheduler.
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

  const balance = openInvoices
    .reduce((sumSoFar, invoice) => {
      const allocated = allocatedByInvoice.get(invoice.id) ?? '0';
      return sumSoFar.plus(
        new Decimal(invoice.totalEtb).minus(invoice.whtEtb).minus(allocated),
      );
    }, new Decimal(0))
    .toFixed(2);

  // Explicit tenantId predicate, belt-and-suspenders alongside RLS (which
  // already scopes this UPDATE to the current tenant on its own) — matches
  // the composite-PK shape every tenant table is queried by elsewhere.
  await tx
    .update(customers)
    .set({ outstandingBalanceEtb: balance, updatedAt: new Date() })
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)));

  return balance;
}
