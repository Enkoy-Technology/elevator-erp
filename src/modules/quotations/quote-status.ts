import type { QuoteStatus } from '../../database/schema/quotations';

/**
 * Allowed next statuses for the quotation lifecycle.
 *
 * Restored from the pre-lean-MVP module (DRAFT -> APPROVED -> PROFORMA ->
 * CONTRACT) and reshaped per the finance-exports-sms task-1 brief:
 *   - PENDING_APPROVAL is a new explicit submit step; APPROVED is no longer
 *     reachable directly from DRAFT.
 *   - EXPIRED is new (DRAFT/PENDING_APPROVAL can lapse without a decision).
 *   - PROFORMA is renamed CONVERTED_TO_PROFORMA; actually creating the
 *     proforma is a later task, so this transition has no endpoint yet (see
 *     QuotationsService) — it only exists here so the DAG shape is right
 *     when that task lands.
 *   - The old CONTRACT/CANCELLED statuses are dropped: contract lifecycle
 *     lives on projects.status now, and nothing here needs a cancel path.
 */
export const QUOTE_STATUS_TRANSITIONS: Readonly<
  Record<QuoteStatus, readonly QuoteStatus[]>
> = {
  DRAFT: ['PENDING_APPROVAL', 'EXPIRED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: ['CONVERTED_TO_PROFORMA'],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED_TO_PROFORMA: [],
};

export const canTransitionQuoteStatus = (
  from: QuoteStatus,
  to: QuoteStatus,
): boolean => QUOTE_STATUS_TRANSITIONS[from].includes(to);
