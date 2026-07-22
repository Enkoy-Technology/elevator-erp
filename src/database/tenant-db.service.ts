import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantIsolationError } from '../common/exceptions';
import { DRIZZLE } from './database.constants';
import type { Database, TenantTransaction } from './database.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every tenant-scoped query MUST go through withTenant(). It wraps the
 * callback in a transaction and sets `app.tenant_id` as a transaction-local
 * GUC, so RLS policies apply and the setting can never leak across pooled
 * connections.
 */
@Injectable()
export class TenantDbService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async withTenant<T>(
    tenantId: string,
    fn: (tx: TenantTransaction) => Promise<T>,
  ): Promise<T> {
    if (!UUID_RE.test(tenantId)) {
      throw new TenantIsolationError(`Invalid tenant id: ${tenantId}`);
    }
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_tenant_context(${tenantId}::uuid)`);
      return fn(tx);
    });
  }
}
