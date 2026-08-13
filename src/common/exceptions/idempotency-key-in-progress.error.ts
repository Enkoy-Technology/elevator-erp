import { DomainError } from './domain.error';

/**
 * The same `Idempotency-Key` is already claimed by a request that is still
 * running — two near-simultaneous submits with the same key, exactly the
 * double-click this whole mechanism exists for (task brief: the client's
 * site loses power ~39 times a month; a "Record payment" click that appears
 * to hang gets clicked again while the first is still in flight). Only the
 * first ever reaches the handler; this is the second's answer while it
 * waits — a retry a few seconds later either replays the first's completed
 * response, or, if the first never finished (its process died mid-handler),
 * reclaims the key (see `IdempotencyKeysRepository.claim`'s stale-reclaim
 * branch).
 */
export class IdempotencyKeyInProgressError extends DomainError {
  readonly status = 409;
  readonly problemType = 'idempotency-key-in-progress';
  readonly title = 'Idempotency key already in progress';

  constructor(key: string) {
    super(
      `Idempotency-Key "${key}" is still being processed by another request — retry shortly.`,
    );
  }
}
