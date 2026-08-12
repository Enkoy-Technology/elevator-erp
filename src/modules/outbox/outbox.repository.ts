import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { outboundMessages } from '../../database/schema';
import type { MessageChannel } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export type OutboundMessageRecord = typeof outboundMessages.$inferSelect;

export interface EnqueueMessageValues {
  channel: MessageChannel;
  recipient: string;
  body: string;
  dedupeKey: string;
  subjectKind?: string;
  subjectId?: string;
  createdByUserId?: string;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Inserts a new outbound message, or — if `dedupeKey` was already used by
   * this tenant — returns the existing row instead of erroring. That swallow
   * IS the idempotency story (task brief 5.4): a reminder job that runs
   * every day, or a caller retrying an HTTP request that already enqueued,
   * must produce one message, not a fresh SMS each time.
   *
   * Uses `ON CONFLICT (tenant_id, dedupe_key) DO NOTHING` rather than a
   * plain insert wrapped in try/catch: Postgres aborts the whole
   * transaction the instant any statement raises (here, a raw insert's
   * 23505 unique violation), and every later statement on that same
   * transaction — including a fallback SELECT for the existing row — then
   * fails with `25P02 current transaction is aborted` until rollback.
   * `TenantDbService.withTenant` runs this in one real transaction, so a
   * try/catch-and-select-in-the-catch-block never actually reaches the
   * SELECT (caught in code review — a mocked unit test doesn't reproduce
   * Postgres's real abort semantics, so this only surfaced against a live
   * database). `ON CONFLICT DO NOTHING` never raises, so the transaction
   * stays healthy and the fallback SELECT below runs normally.
   */
  async enqueue(
    tenantId: string,
    values: EnqueueMessageValues,
  ): Promise<OutboundMessageRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [inserted] = await tx
        .insert(outboundMessages)
        .values({ tenantId, ...values })
        .onConflictDoNothing({
          target: [outboundMessages.tenantId, outboundMessages.dedupeKey],
        })
        .returning();

      if (inserted) {
        return inserted;
      }

      const [existing] = await tx
        .select()
        .from(outboundMessages)
        .where(
          and(
            eq(outboundMessages.tenantId, tenantId),
            eq(outboundMessages.dedupeKey, values.dedupeKey),
          ),
        )
        .limit(1);
      if (!existing) {
        // The conflict named this (tenantId, dedupeKey) pair; it existing a
        // moment ago and not now would mean a concurrent delete, which this
        // table's grants never allow (no DELETE).
        throw new Error(
          `Outbox enqueue conflicted on dedupeKey "${values.dedupeKey}" but no existing row was found`,
        );
      }
      return existing;
    });
  }
}
