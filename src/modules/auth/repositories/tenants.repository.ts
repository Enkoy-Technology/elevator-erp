import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE } from '../../../database/database.constants';
import type { Database } from '../../../database/database.types';

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
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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
}
