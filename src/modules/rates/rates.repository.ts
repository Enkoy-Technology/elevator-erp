import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, desc, isNull, lte, or, eq, gte } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Database } from '../../database/database.types';
import { rateVersions, type RateKind } from '../../database/schema';

export type RateVersionRecord = typeof rateVersions.$inferSelect;
export type RateVersionInsert = typeof rateVersions.$inferInsert;

export interface RotateRateVersionInput {
  kind: RateKind;
  validFrom: string;
  payload: unknown;
  source: string;
}

/** `validFrom` is a 'YYYY-MM-DD' ISO date string; the day before it, same format. */
function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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
   * open version. `for('update')` locks the open row so two concurrent
   * admin submits for the same kind serialize instead of both racing past
   * the validFrom check and colliding on the "one open row per kind" index.
   */
  async rotate(input: RotateRateVersionInput): Promise<RateVersionRecord> {
    return this.db.transaction(async (tx) => {
      const [openRow] = await tx
        .select()
        .from(rateVersions)
        .where(
          and(eq(rateVersions.kind, input.kind), isNull(rateVersions.validTo)),
        )
        .for('update')
        .limit(1);

      if (openRow && !(input.validFrom > openRow.validFrom)) {
        throw new BadRequestException(
          `validFrom (${input.validFrom}) must be strictly after the current open version's validFrom (${openRow.validFrom})`,
        );
      }

      if (openRow) {
        await tx
          .update(rateVersions)
          .set({ validTo: dayBefore(input.validFrom) })
          .where(eq(rateVersions.id, openRow.id));
      }

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
    });
  }
}
