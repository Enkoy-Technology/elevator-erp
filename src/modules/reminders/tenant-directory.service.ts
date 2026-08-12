import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Database } from '../../database/database.types';

/**
 * Enumerates tenant ids for this module's crons, which run off `@Cron` with
 * no authenticated tenant to scope a normal `TenantDbService.withTenant`
 * call to. See migration 0052_list_active_tenant_ids.sql's own doc comment
 * for why this calls a SECURITY DEFINER function — the same mechanism
 * `resolve_tenant_by_slug()` already uses for login's identical "resolve
 * before a tenant context exists" problem — rather than the outbox
 * dispatcher's dedicated-role-plus-admin_bypass approach (task-1): that
 * machinery earns its keep for a cross-tenant claim over business rows,
 * which this single-column read isn't. Every OTHER query in this module's
 * crons goes through the normal `withTenant` path, one tenant at a time,
 * once a tenant id from here is in hand.
 */
@Injectable()
export class TenantDirectoryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listActiveTenantIds(): Promise<string[]> {
    const result = await this.db.execute<{ id: string }>(
      sql`select * from list_active_tenant_ids()`,
    );
    return result.rows.map((row) => row.id);
  }
}
