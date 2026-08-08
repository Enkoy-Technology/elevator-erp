import type { RateKind } from '../../database/schema';
import { DomainError } from './domain.error';

export class RateNotFoundError extends DomainError {
  readonly status = 404;
  readonly problemType = 'rate-not-found';
  readonly title = 'Rate version not found';

  constructor(kind: RateKind, onDate: string) {
    super(`No ${kind} rate version covers ${onDate}`);
  }
}
