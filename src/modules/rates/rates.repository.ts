import { Inject, Injectable } from '@nestjs/common';
import { and, desc, isNull, lte, or, eq, gte } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Database } from '../../database/database.types';
import { rateVersions, type RateKind } from '../../database/schema';

export type RateVersionRecord = typeof rateVersions.$inferSelect;
export type RateVersionInsert = typeof rateVersions.$inferInsert;

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
}
