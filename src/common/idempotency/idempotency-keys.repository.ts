import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { idempotencyKeys } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { isUniqueViolation } from '../db-errors';
import { IdempotencyKeyConflictError } from '../exceptions/idempotency-key-conflict.error';
import { IdempotencyKeyInProgressError } from '../exceptions/idempotency-key-in-progress.error';

export type IdempotencyClaim =
  | { kind: 'won' }
  | { kind: 'replay'; status: number; body: unknown };

/**
 * A claimed-but-never-completed row (its claimant crashed before calling
 * `complete()`) is reclaimed once it is this old, so one dead request can't
 * wedge a key forever. The client's site loses power ~39 times a month
 * (task brief) — a claimant dying mid-handler is a designed-for case here,
 * not a hypothetical.
 *
 * ponytail: crude wall-clock staleness, not a heartbeat/lease — correct for
 * a single API instance (this deploy — see docker-compose.prod.yml). Revisit
 * if the API ever runs more than one replica, where a slow-but-alive
 * claimant could be wrongly reclaimed by a second instance.
 */
const STALE_CLAIM_MS = 30_000;

/**
 * Backs the `Idempotency-Key` header protocol for
 * `IdempotencyInterceptor` — see that class's doc comment for the request-
 * level story. This repository owns the state machine:
 *
 *   INSERT (tenant_id, key) unique  -->  { kind: 'won' }, caller runs the
 *     handler and must call `complete()`.
 *   conflicting row, response already stored, fingerprint MATCHES  -->
 *     { kind: 'replay' }: a genuine repeat, the handler must not re-run.
 *   conflicting row, fingerprint DIFFERS (different body or endpoint)  -->
 *     throws IdempotencyKeyConflictError (409): a client bug, not a replay.
 *   conflicting row, no response yet, still fresh  -->  throws
 *     IdempotencyKeyInProgressError (409): another request holding this key
 *     is genuinely in flight right now.
 *   conflicting row, no response yet, older than STALE_CLAIM_MS  -->
 *     reclaimed (treated as `{ kind: 'won' }`) instead of blocking forever.
 */
@Injectable()
export class IdempotencyKeysRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async claim(
    tenantId: string,
    key: string,
    endpoint: string,
    fingerprint: string,
  ): Promise<IdempotencyClaim> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const staleThreshold = new Date(Date.now() - STALE_CLAIM_MS);
      let won = false;
      try {
        const [row] = await tx
          .insert(idempotencyKeys)
          .values({ tenantId, key, endpoint, fingerprint })
          .onConflictDoUpdate({
            target: [idempotencyKeys.tenantId, idempotencyKeys.key],
            set: { endpoint, fingerprint, createdAt: new Date() },
            // Only overwrite (reclaim) a conflicting row that is BOTH still
            // unresolved AND stale — a completed row, or a fresh in-flight
            // one, must fall through to the read below untouched.
            setWhere: sql`${idempotencyKeys.responseBody} is null and ${idempotencyKeys.createdAt} < ${staleThreshold}`,
          })
          .returning({ id: idempotencyKeys.id });
        won = row !== undefined;
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
        }
      }
      if (won) {
        return { kind: 'won' as const };
      }

      const [existing] = await tx
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.key, key)))
        .limit(1);
      if (!existing) {
        // Vanishingly unlikely: the conflicting row this failed to win was
        // removed between the upsert attempt and this read. Safe to treat
        // as a fresh claim.
        return this.claim(tenantId, key, endpoint, fingerprint);
      }
      if (existing.fingerprint !== fingerprint) {
        throw new IdempotencyKeyConflictError(key);
      }
      if (existing.responseStatus !== null && existing.responseBody !== null) {
        return { kind: 'replay' as const, status: existing.responseStatus, body: existing.responseBody };
      }
      throw new IdempotencyKeyInProgressError(key);
    });
  }

  /** Fills in the stored response for a claim `claim()` returned `{ kind: 'won' }` for. */
  async complete(tenantId: string, key: string, status: number, body: unknown): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      await tx
        .update(idempotencyKeys)
        .set({ responseStatus: status, responseBody: body })
        .where(and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.key, key)));
    });
  }
}
