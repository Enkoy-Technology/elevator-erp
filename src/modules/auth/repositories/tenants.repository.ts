import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { DRIZZLE } from '../../../database/database.constants';
import type { Database } from '../../../database/database.types';
import { tenants } from '../../../database/schema';
import { TenantDbService } from '../../../database/tenant-db.service';

export interface TenantLoginInfo {
  id: string;
  subscriptionStatus: string;
}

/**
 * Tenant resolution happens BEFORE a tenant context exists (login knows only
 * the slug), so it goes through the SECURITY DEFINER function
 * resolve_tenant_by_slug() instead of a direct RLS-guarded table read.
 */
@Injectable()
export class TenantsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly tenantDb: TenantDbService,
  ) {}

  async resolveActiveBySlug(slug: string): Promise<TenantLoginInfo | null> {
    const result = await this.db.execute<{
      id: string;
      subscription_status: string;
    }>(sql`select * from resolve_tenant_by_slug(${slug})`);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return { id: row.id, subscriptionStatus: row.subscription_status };
  }

  /**
   * Token refresh already knows the tenant id, so this reads the tenant's own
   * row under its RLS context — no SECURITY DEFINER needed.
   */
  async findActiveById(tenantId: string): Promise<TenantLoginInfo | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: tenants.id,
          subscriptionStatus: tenants.subscriptionStatus,
        })
        .from(tenants)
        .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }
}
