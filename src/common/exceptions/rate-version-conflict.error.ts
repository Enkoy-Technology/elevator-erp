import { DomainError } from './domain.error';

/**
 * Defense in depth for RatesRepository.rotate(): the per-kind advisory lock
 * is what actually prevents two concurrent rotations of the same kind from
 * racing, but if that is ever bypassed or the unique index is hit some
 * other way, the raw Postgres 23505 (unique_violation) is reclassified here
 * instead of surfacing as an unhandled 500.
 */
export class RateVersionConflictError extends DomainError {
  readonly status = 409;
  readonly problemType = 'rate-version-conflict';
  readonly title = 'Rate version conflict';

  constructor() {
    super('Another rate version for this kind was just opened; retry.');
  }
}
