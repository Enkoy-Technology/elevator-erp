import { DomainError } from './domain.error';

export class InvalidRateTransitionError extends DomainError {
  readonly status = 400;
  readonly problemType = 'invalid-rate-transition';
  readonly title = 'Invalid rate transition';
}
