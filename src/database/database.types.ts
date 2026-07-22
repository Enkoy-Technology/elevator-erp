import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/** Transaction handle passed to callbacks running inside a tenant context. */
export type TenantTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];
