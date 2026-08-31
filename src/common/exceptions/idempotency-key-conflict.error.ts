import { DomainError } from './domain.error';

/**
 * The same `Idempotency-Key` header value was reused for a request whose
 * fingerprint doesn't match the one it was first claimed with — either a
 * different body, or a different endpoint (`IdempotencyKeysRepository`'s
 * fingerprint hashes both together, see request-fingerprint.ts). Never
 * replayed silently: reusing a key across two logically different requests
 * is a client bug (task brief), and returning the stale cached response for
 * a NEW request would hide that bug instead of surfacing it.
 */
export class IdempotencyKeyConflictError extends DomainError {
  readonly status = 409;
  readonly problemType = 'idempotency-key-conflict';
  readonly title = 'Idempotency key conflict';

  constructor(key: string) {
    super(
      `Idempotency-Key "${key}" was already used for a different request (different body or endpoint) — use a new key for a new request.`,
    );
  }
}
