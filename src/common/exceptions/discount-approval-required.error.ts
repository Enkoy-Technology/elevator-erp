import { DomainError } from './domain.error';

/**
 * A quotation may not be submitted, or its proforma issued, because its
 * negotiated discount is above the tenant's
 * `discountApprovalThresholdPercent` and nobody has signed off.
 *
 * Distinct from WorkflowTransitionError on purpose: the transition itself is
 * legal (DRAFT -> PENDING_APPROVAL), and the UI's remedy is a different one
 * — go and get the discount approved, not reload the page. Only ever raised
 * when the tenant has actually SET a threshold; NULL (the default) means no
 * approval is required and this error can never occur.
 */
export class DiscountApprovalRequiredError extends DomainError {
  readonly status = 403;
  readonly problemType = 'discount-approval-required';
  readonly title = 'Discount approval required';

  constructor(
    discountPercent: string,
    thresholdPercent: string,
    /** What the sign-off is missing for: submitting, or issuing the proforma. */
    before: 'submitting it' | 'issuing its proforma' = 'submitting it',
  ) {
    super(
      `This quotation discounts ${discountPercent}%, above the ${thresholdPercent}% that needs sign-off. Have the discount approved before ${before}.`,
    );
  }
}
