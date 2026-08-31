const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Extracts a Postgres error code from a thrown error. drizzle-orm's
 * node-postgres driver wraps the raw pg error (which carries `.code`)
 * inside a `DrizzleQueryError` whose own `.code` is undefined — the real
 * code only shows up one level down, on `.cause`. Same discovery as every
 * `isUniqueViolation` copy already in this codebase (payments/invoices/
 * bank-transactions repositories) — this is the extraction logic those
 * three share, factored out just once more for `isForeignKeyViolation`
 * below.
 */
function pgErrorCode(err: unknown): string | undefined {
  const code = (v: unknown): string | undefined =>
    typeof v === 'object' && v !== null ? (v as { code?: string }).code : undefined;
  return code(err) ?? code((err as { cause?: unknown } | null)?.cause);
}

/**
 * Postgres `foreign_key_violation` — a well-formed id (customerId,
 * bankAccountId, projectId, ...) that doesn't resolve to a row this
 * tenant/transaction can see (wrong tenant, soft-deleted, or simply
 * missing), reclassified as a 404 instead of an unhandled 500.
 *
 * Lives in /common — unlike the per-repository `isUniqueViolation` copies,
 * which the codebase tolerates duplicating up to the 2nd occurrence and
 * only extracts at the 3rd+ — because this helper is needed by FOUR
 * modules (payments, invoices, expenses, banks) from the moment it is
 * written. CLAUDE.md forbids importing one feature module into another, so
 * a helper four modules share on day one belongs in /common, not
 * duplicated four times (same reasoning as customer-balance.ts living
 * here instead of in payments/ or invoices/).
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === PG_FOREIGN_KEY_VIOLATION;
}

/**
 * Postgres `unique_violation`, reclassified instead of surfacing as a raw
 * driver error. `payments`/`invoices`/`bank-transactions` repositories each
 * still carry their own pre-existing local copy of this exact check (the
 * codebase's own "tolerate up to the 2nd occurrence, extract at the 3rd+"
 * convention — see their own `isUniqueViolation` doc comments) — those are
 * left untouched here, since this task has no reason to touch them.
 * `IdempotencyKeysRepository` is the 4th call site, so it gets the shared
 * one instead of a 5th local copy.
 */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === PG_UNIQUE_VIOLATION;
}
