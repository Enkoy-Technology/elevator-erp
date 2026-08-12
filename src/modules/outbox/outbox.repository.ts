import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { outboundMessages } from '../../database/schema';
import type { MessageChannel } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export type OutboundMessageRecord = typeof outboundMessages.$inferSelect;

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Same discovery/shape as the isUniqueViolation copy in every other
 * repository that catches a Postgres conflict (rates/payments/invoices/
 * bank-transactions) — see db-errors.ts's doc comment on why these live
 * per-repository rather than extracted.
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (v: unknown): string | undefined =>
    typeof v === 'object' && v !== null ? (v as { code?: string }).code : undefined;
  return (
    code(err) === PG_UNIQUE_VIOLATION ||
    code((err as { cause?: unknown } | null)?.cause) === PG_UNIQUE_VIOLATION
  );
}

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
   * must produce one message, not a fresh SMS each time. Relies entirely on
   * the (tenant_id, dedupe_key) unique index
   * (0048_outbound_messages_rls.sql) — insert-then-catch, no pre-check, same
   * shape as every other conflict path in this codebase.
   */
  async enqueue(
    tenantId: string,
    values: EnqueueMessageValues,
  ): Promise<OutboundMessageRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      try {
        const [row] = await tx
          .insert(outboundMessages)
          .values({ tenantId, ...values })
          .returning();
        if (!row) {
          throw new Error('Failed to insert outbound message');
        }
        return row;
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
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
          // The unique violation named this (tenantId, dedupeKey) pair; it
          // existing a moment ago and not now would mean a concurrent
          // delete, which this table's grants never allow (no DELETE).
          throw err;
        }
        return existing;
      }
    });
  }
}
