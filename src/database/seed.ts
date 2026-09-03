/* eslint-disable no-console */
import { hash } from 'bcrypt';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { RatesRepository } from '../modules/rates/rates.repository';
import { seedRates } from '../modules/rates/seed-rates';
import { seedDocumentContent } from '../modules/settings/seed-document-content';
import type { Database } from './database.types';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demo-accounts';
import { seedDemoBusinessData } from './seed-demo-data';
import * as schema from './schema';

const BCRYPT_ROUNDS = 12;

export const assertSeedAllowed = (env: NodeJS.ProcessEnv): void => {
  // Gated in every environment, not just NODE_ENV=production: an operator
  // shell with no NODE_ENV set but DATABASE_ADMIN_URL pointed at a real
  // database must not sail through just because the shell isn't labeled
  // "production".
  if (env.ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      'Refusing to seed demo data. Set ALLOW_DEMO_SEED=1 to override.',
    );
  }
};

/**
 * Inserts any demo account this tenant is missing, leaving existing ones
 * alone (their password may have been changed deliberately).
 *
 * Per-ACCOUNT rather than per-tenant, for the same reason seedRates and
 * seedDocumentContent are: a tenant seeded before a role existed should gain
 * that role on the next run, not be skipped wholesale. Getting this wrong is
 * how a demo ends up with a login button for an account that was never
 * created.
 */
const seedDemoAccounts = async (
  db: Database,
  tenantId: string,
): Promise<number> => {
  const existing = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.tenantId, tenantId));
  const have = new Set(existing.map((row) => row.email));
  const missing = DEMO_ACCOUNTS.filter((account) => !have.has(account.email));
  if (missing.length === 0) {
    return 0;
  }
  const passwordHash = await hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  await db.insert(schema.users).values(
    missing.map((account) => ({
      tenantId,
      email: account.email,
      passwordHash,
      fullName: account.fullName,
      role: account.role,
    })),
  );
  return missing.length;
};

/**
 * An owner connection that can actually write the tenant tables.
 *
 * `tenants`, `tenant_branding` and `users` are FORCE ROW LEVEL SECURITY
 * (migration 0001), which subjects even the table owner to the policies —
 * a *superuser* bypasses them unconditionally, and that is what this script
 * relied on. On managed Postgres (Neon's `neondb_owner`) there is no
 * superuser, so the inserts below would match no permissive policy and fail.
 * Opting the session into the `admin_bypass` policy is the same move
 * `seedDocumentContent` and `OutboxDispatcherRepository` already make, and
 * it is a no-op where a real superuser is connecting.
 *
 * Session-level rather than transaction-local because this pool belongs to a
 * one-shot script and is never handed to request-scoped code.
 */
export const openAdminPool = (url: string): Pool => {
  const pool = new Pool({ connectionString: url, max: 1 });
  pool.on('connect', (client) => {
    client
      .query("SET app.admin_bypass = 'on'")
      .catch((error: unknown) => console.error('admin_bypass not set:', error));
  });
  return pool;
};

/**
 * Brings a migrated database to a demo-ready state on a caller-owned
 * connection: statutory rates, the `demo` tenant, one account per role, and
 * the document boilerplate. Every step is idempotent per row, so this tops up
 * a half-seeded database rather than duplicating it.
 *
 * Exported so `demo-bootstrap.cli.ts` can run migrate → rotate → seed against
 * a single pool; `main()` below is the plain `pnpm run db:seed` entrypoint.
 */
export const seedDemoData = async (db: Database): Promise<void> => {
  // Statutory rates are not demo data — seed them regardless of whether
  // the demo tenant below already exists, so re-running this script never
  // skips them once the demo tenant is in place. Every caller of this
  // function is gated by assertSeedAllowed, and it must never run in
  // production; the
  // production path for rates is `pnpm run db:seed:rates`
  // (seed-rates.cli.ts), which has no demo gate and runs on every deploy.
  await seedRates(new RatesRepository(db));

  const existing = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, 'demo'));

  const [alreadySeeded] = existing;
  if (alreadySeeded) {
    // Same reasoning as seedRates above: document boilerplate is idempotent
    // and never overwrites edited text, so re-running tops up a demo tenant
    // that predates it instead of silently skipping.
    await seedDocumentContent(db, alreadySeeded.id);
    const topUp = await seedDemoBusinessData(db, alreadySeeded.id);
    if (topUp.customers > 0 || topUp.projects > 0) {
      console.log(
        `Added ${topUp.customers} demo customers and ${topUp.projects} projects.`,
      );
    }
    const added = await seedDemoAccounts(db, alreadySeeded.id);
    console.log(
      added > 0
        ? `Demo tenant already seeded; added ${added} missing role account(s).`
        : 'Demo tenant already seeded, skipping.',
    );
    console.log(`Password for every demo account: ${DEMO_PASSWORD}`);
    for (const account of DEMO_ACCOUNTS) {
      console.log(`  ${account.role.padEnd(18)} ${account.email}`);
    }
    return;
  }

  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug: 'demo',
      name: 'Demo Elevators PLC',
      legalName: 'Demo Elevators Private Limited Company',
      subscriptionTier: 'GROWTH',
      subscriptionStatus: 'ACTIVE',
    })
    .returning();
  if (!tenant) {
    throw new Error('Failed to insert demo tenant');
  }

  await db.insert(schema.tenantBranding).values({ tenantId: tenant.id });

  // One account per role, so a demo can be given from each seat in turn
  // rather than from the CEO's — which passes every permission check and so
  // shows none of them working. Same password throughout: this tenant only
  // exists behind ALLOW_DEMO_SEED.
  //
  // CUSTOMER is seeded for completeness but has no screens of its own yet;
  // signing in as one lands on an empty sidebar. The login picker says so.
  await seedDemoAccounts(db, tenant.id);

  // The demo tenant prints the same documents as a real one, so it gets the
  // same boilerplate; the production path is `pnpm run db:seed:document-content`.
  await seedDocumentContent(db, tenant.id);

  // Customers and projects. Separate from the tenant's own setup because a
  // real tenant must start EMPTY and a demo must not — eight empty tables
  // look identical to a broken system.
  const business = await seedDemoBusinessData(db, tenant.id);
  console.log(
    `Seeded ${business.customers} demo customers and ${business.projects} projects.`,
  );

  console.log(`Seeded demo tenant ${tenant.id} (slug: demo)`);
  console.log(`Password for every account below: ${DEMO_PASSWORD}`);
  for (const account of DEMO_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(18)} ${account.email}`);
  }
};

const main = async (): Promise<void> => {
  assertSeedAllowed(process.env);

  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL (or DATABASE_URL) must be set');
  }
  const pool = openAdminPool(url);

  try {
    await seedDemoData(drizzle(pool, { schema }));
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
