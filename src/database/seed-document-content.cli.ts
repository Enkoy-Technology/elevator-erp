/* eslint-disable no-console */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { seedDocumentContent } from '../modules/settings/seed-document-content';
import * as schema from './schema';

/**
 * Load one tenant's document boilerplate and component/brand table.
 *
 * Separate from `bootstrap-tenant.cli.ts` rather than folded into it: that
 * script returns early when the tenant already exists, so hanging this off it
 * would silently skip every deployment whose tenant was created before this
 * content existed — which is all of them. Like `seed-rates.cli.ts` this is
 * real data, not demo data, so it carries no ALLOW_DEMO_SEED gate, and it is
 * idempotent, so it is safe to run on every deploy.
 *
 *   TENANT_SLUG=shining-star pnpm run db:seed:document-content
 */
const main = async (): Promise<void> => {
  const slug = (process.env.TENANT_SLUG ?? '').trim().toLowerCase();
  if (!slug) {
    throw new Error('TENANT_SLUG must be set (the tenant whose documents these are)');
  }
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL must be set');
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    const [tenant] = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .limit(1);
    if (!tenant) {
      throw new Error(`No tenant with slug '${slug}' — run pnpm run db:bootstrap first`);
    }

    const inserted = await seedDocumentContent(db, tenant.id);
    console.log(
      `Tenant '${slug}': inserted ${inserted.boilerplate} boilerplate section(s), ` +
        `${inserted.components} component row(s). Existing rows were left untouched.`,
    );
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
