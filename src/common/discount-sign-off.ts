import { Decimal } from 'decimal.js';

/**
 * Whether a negotiated discount still needs a manager's sign-off: there is a
 * discount, nobody has signed it off, the tenant sets a threshold, and the
 * discount is above it. A negative percent is a premium, which never needs
 * one, and a NULL threshold (the default) means no discount does.
 *
 * Shared by the two places an offer moves on — submitting a quotation and
 * issuing its proforma — so the rule cannot differ between them.
 */
export const discountNeedsSignOff = (
  discountPercent: string | null,
  approvedByUserId: string | null,
  thresholdPercent: string | null,
): boolean =>
  discountPercent !== null &&
  !approvedByUserId &&
  thresholdPercent !== null &&
  new Decimal(discountPercent).greaterThan(thresholdPercent);
