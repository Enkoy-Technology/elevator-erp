import type { QuoteStatus } from '../../database/schema/quotations';

/**
 * Allowed next statuses for the sales-document lifecycle
 * (quote → proforma → contract). Approval/conversion side-effects land in
 * later slices; this only enforces the DAG shape.
 */
export const QUOTE_STATUS_TRANSITIONS: Readonly<
  Record<QuoteStatus, readonly QuoteStatus[]>
> = {
  DRAFT: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PROFORMA', 'CANCELLED'],
  PROFORMA: ['CONTRACT', 'CANCELLED'],
  REJECTED: [],
  CONTRACT: [],
  CANCELLED: [],
};

export const canTransitionQuoteStatus = (
  from: QuoteStatus,
  to: QuoteStatus,
): boolean => QUOTE_STATUS_TRANSITIONS[from].includes(to);
