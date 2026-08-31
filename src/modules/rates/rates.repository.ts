import { Inject, Injectable } from '@nestjs/common';
import { and, desc, isNull, lte, or, eq, gte, sql } from 'drizzle-orm';

import { InvalidRateTransitionError, RateVersionConflictError } from '../../common/exceptions';
import { DRIZZLE } from '../../database/database.constants';
import type { Database } from '../../database/database.types';
import { rateVersions, type RateKind } from '../../database/schema';

export type RateVersionRecord = typeof rateVersions.$inferSelect;
export type RateVersionInsert = typeof rateVersions.$inferInsert;

export interface RotateRateVersionInput {
  kind: RateKind;
  validFrom: string;
  payload: Record<string, unknown>;
  source: string;
}

/** `validFrom` is a 'YYYY-MM-DD' ISO date string; the day before it, same format. */
function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Postgres `unique_violation` (rate_versions_one_open_per_kind). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

/**
 * rate_versions is a GLOBAL table (no tenant_id, no RLS) — statutory rates
 * are national, not per-tenant. It is read directly via the shared DRIZZLE
 * connection, following the non-tenant-scoped pattern in
 * TenantsRepository.resolveActiveBySlug (no TenantDbService.withTenant,
 * since there is no tenant GUC to set for a table RLS doesn't apply to).
 */
@Injectable()
export class RatesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findActive(
    kind: RateKind,
    onDate: string,
  ): Promise<RateVersionRecord | undefined> {
    const rows = await this.db
      .select()
      .from(rateVersions)
      .where(
        and(
          eq(rateVersions.kind, kind),
          lte(rateVersions.validFrom, onDate),
          or(isNull(rateVersions.validTo), gte(rateVersions.validTo, onDate)),
        ),
      )
      .orderBy(desc(rateVersions.validFrom))
      .limit(1);
    return rows[0];
  }

  /** Kinds that currently have an open (valid_to IS NULL) version — used to seed idempotently. */
  async findOpenKinds(): Promise<RateKind[]> {
    const rows = await this.db
      .select({ kind: rateVersions.kind })
      .from(rateVersions)
      .where(isNull(rateVersions.validTo));
    return rows.map((row) => row.kind);
  }

  async create(values: RateVersionInsert): Promise<RateVersionRecord> {
    const [row] = await this.db.insert(rateVersions).values(values).returning();
    if (!row) {
      throw new Error('Failed to insert rate version');
    }
    return row;
  }

  /**
   * Admin rate change, in one transaction: close the currently-open version
   * of `kind` (valid_to = day before the new validFrom) and insert the new
   * open version.
   *
   * Serialized per kind with a Postgres advisory lock (mirrors
   * EmployeesRepository.update's per-tenant lock) — `SELECT ... FOR UPDATE`
   * on the open row is NOT enough on its own: under READ COMMITTED, a
   * transaction blocked on that row only re-checks that specific row once
   * the blocker commits; it never re-scans for the blocker's newly-inserted
   * row. So the loser would see "no open row", skip the validFrom guard
   * entirely, and its insert would die on the partial unique index as a
   * raw, unhandled 500. The advisory lock blocks the whole transaction
   * until the first commits, so the loser's SELECT below always runs
   * against the real current state.
   */
  async rotate(input: RotateRateVersionInput): Promise<RateVersionRecord> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.kind}::text)::bigint)`,
      );

      const [openRow] = await tx
        .select()
        .from(rateVersions)
        .where(
          and(eq(rateVersions.kind, input.kind), isNull(rateVersions.validTo)),
        )
        .limit(1);

      if (openRow && !(input.validFrom > openRow.validFrom)) {
        throw new InvalidRateTransitionError(
          `validFrom (${input.validFrom}) must be strictly after the current open version's validFrom (${openRow.validFrom})`,
        );
      }

      if (openRow) {
        await tx
          .update(rateVersions)
          .set({ validTo: dayBefore(input.validFrom) })
          .where(eq(rateVersions.id, openRow.id));
      }

      try {
        const [row] = await tx
          .insert(rateVersions)
          .values({
            kind: input.kind,
            validFrom: input.validFrom,
            payload: input.payload,
            source: input.source,
          })
          .returning();
        if (!row) {
          throw new Error('Failed to insert rate version');
        }
        return row;
      } catch (err) {
        // Defense in depth: the advisory lock above should make this
        // unreachable, but never let a raw constraint violation surface as
        // an unhandled 500.
        if (isUniqueViolation(err)) {
          throw new RateVersionConflictError();
        }
        throw err;
      }
    });
  }
}
