import { Decimal } from 'decimal.js';

import type { InvoiceStatus } from '../../database/schema';

/**
 * Payment-status derivation for an ISSUED/PARTIALLY_PAID/PAID invoice (VOID
 * is a separate, terminal transition — see InvoicesRepository.void — and is
 * never an input to this function).
 *
 * DECISION (task-2 brief §2.3): paid-in-full means
 * `Σ allocations + whtEtb >= totalEtb` — the customer legally pays
 * `totalEtb - whtEtb` in cash/bank/etc, and the WHT credit note the customer
 * holds settles the remainder; the invoice is fully discharged once the
 * cash actually received plus that retained withholding together cover the
 * total, not once cash alone does.
 *
 * Pure function — no DB access — so the derivation matrix is unit-testable
 * without a transaction. InvoicesRepository.recomputePaymentStatus wraps
 * this with the actual Σ payment_allocations query + CAS update.
 */
export function derivePaymentStatus(input: {
  totalEtb: string;
  whtEtb: string;
  allocatedEtb: string;
}): Exclude<InvoiceStatus, 'VOID'> {
  const total = new Decimal(input.totalEtb);
  const allocated = new Decimal(input.allocatedEtb);
  const settled = allocated.plus(input.whtEtb);

  if (settled.gte(total)) {
    return 'PAID';
  }
  if (allocated.gt(0)) {
    return 'PARTIALLY_PAID';
  }
  return 'ISSUED';
}
