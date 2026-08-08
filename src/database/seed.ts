/* eslint-disable no-console */
import { hash } from 'bcrypt';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

const BCRYPT_ROUNDS = 12;

export const assertSeedAllowed = (env: NodeJS.ProcessEnv): void => {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      'Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=1 to override.',
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
    const existing = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, 'demo'));

    if (existing.length > 0) {
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
