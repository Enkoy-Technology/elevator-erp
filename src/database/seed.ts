/* eslint-disable no-console */
import { hash } from 'bcrypt';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { RatesRepository } from '../modules/rates/rates.repository';
import { seedRates } from '../modules/rates/seed-rates';
import { seedDocumentContent } from '../modules/settings/seed-document-content';
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

const main = async (): Promise<void> => {
  assertSeedAllowed(process.env);

  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL (or DATABASE_URL) must be set');
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    // Statutory rates are not demo data — seed them regardless of whether
    // the demo tenant below already exists, so re-running this script never
    // skips them once the demo tenant is in place. This script is gated by
    // assertSeedAllowed above and must never run in production; the
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
      console.log('Demo tenant already seeded, skipping.');
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

    await db.insert(schema.users).values({
      tenantId: tenant.id,
      email: 'ceo@demo.example.com',
      passwordHash: await hash('Demo!Passw0rd', BCRYPT_ROUNDS),
      fullName: 'Demo CEO',
      role: 'CEO',
    });

    // The demo tenant prints the same documents as a real one, so it gets the
    // same boilerplate; the production path is `pnpm run db:seed:document-content`.
    await seedDocumentContent(db, tenant.id);

    console.log(`Seeded demo tenant ${tenant.id} (slug: demo)`);
    console.log('Login: ceo@demo.example.com / Demo!Passw0rd');
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
