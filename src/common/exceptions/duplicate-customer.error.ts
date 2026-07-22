import { DomainError } from './domain.error';
import type {
  DuplicateMatchSummary,
  DuplicateRecommendation,
} from '../types/duplicate.types';

/**
 * Raised when creating a customer would insert a likely duplicate.
 * RFC 7807 extras: recommendation + matches (see AllExceptionsFilter).
 */
export class DuplicateCustomerError extends DomainError {
  readonly status = 409;
  readonly problemType = 'duplicate-customer';
  readonly title = 'Possible duplicate customer';

  constructor(
    detail: string,
    readonly recommendation: DuplicateRecommendation,
    readonly matches: DuplicateMatchSummary[],
  ) {
    super(detail);
  }
}
