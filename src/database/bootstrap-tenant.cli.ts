/* eslint-disable no-console */
import { hash } from 'bcrypt';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

/**
 * Create the first real tenant and its first administrator.
 *
 * Why this exists: `seed.ts` was the only code path in the repo that could
 * insert a tenant, and it is gated behind `ALLOW_DEMO_SEED=1` because it
 * writes a demo tenant with published credentials
 * (`ceo@demo.example.com` / `Demo!Passw0rd`). The deploy runbook says that
 * flag must never be set in production — which left a real deployment with
 * no supported way to get its first login at all. On an internet-facing
 * box the demo seed is worse than unsupported: anyone who finds the URL
 * knows the password.
 *
 * So this is the production entrypoint, and like `seed-rates.cli.ts` it
 * carries no ALLOW_DEMO_SEED gate — a named company and an operator-chosen
 * password are real data, not demo data. Everything comes from the
 * environment so no credential is ever committed:
 *
 *   TENANT_SLUG=shining-star \
 *   TENANT_NAME='Shining Star Electromechanical Works' \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD='<generated>' \
 *   pnpm run db:bootstrap
 *
 * Idempotent: re-running with an existing slug reports and exits without
 * touching anything, so it is safe in a deploy script that runs every time.
 */

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

interface BootstrapInput {
  slug: string;
  name: string;
  email: string;
  password: string;
  legalName: string;
  fullName: string;
}

/** Exported for the unit test — every rejection here is a footgun someone
 *  would otherwise only discover after the tenant existed. */
export const parseBootstrapEnv = (env: NodeJS.ProcessEnv): BootstrapInput => {
  const slug = (env.TENANT_SLUG ?? '').trim().toLowerCase();
  const name = (env.TENANT_NAME ?? '').trim();
  const email = (env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? '';

  const missing = [
    ['TENANT_SLUG', slug],
    ['TENANT_NAME', name],
    ['ADMIN_EMAIL', email],
    ['ADMIN_PASSWORD', password],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  // The slug is the tenant's login identifier (POST /auth/login takes
  // tenantSlug), so a malformed one locks the tenant out of its own login.
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `TENANT_SLUG must be a lowercase subdomain-style slug (got '${slug}') — letters, digits and hyphens, not starting or ending with a hyphen.`,
    );
  }
  if (!email.includes('@')) {
    throw new Error(`ADMIN_EMAIL must be an email address (got '${email}')`);
  }
  // Deliberately only a length floor: this account is the one that can
  // reset every other password, and a deployment script is exactly where a
  // three-character placeholder gets typed "just for now".
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters (got ${password.length}). Generate one: openssl rand -base64 24`,
    );
  }

  return {
    slug,
    name,
    email,
    password,
    legalName: env.TENANT_LEGAL_NAME?.trim() || name,
    fullName: env.ADMIN_FULL_NAME?.trim() || 'Administrator',
  };
};

const main = async (): Promise<void> => {
  const input = parseBootstrapEnv(process.env);

  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL must be set (the owner role, as for migrations)');
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    const [existing] = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, input.slug))
      .limit(1);
    if (existing) {
      console.log(`Tenant '${input.slug}' already exists (${existing.id}), skipping.`);
      return;
    }

    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        slug: input.slug,
        name: input.name,
        legalName: input.legalName,
        subscriptionTier: 'GROWTH',
        subscriptionStatus: 'ACTIVE',
      })
      .returning();
    if (!tenant) {
      throw new Error('Failed to insert tenant');
    }

    // Every branded document reads this row; without it the letterhead
    // renderer has nothing to read and PDFs come out unbranded.
    await db.insert(schema.tenantBranding).values({ tenantId: tenant.id });

    await db.insert(schema.users).values({
      tenantId: tenant.id,
      email: input.email,
      passwordHash: await hash(input.password, BCRYPT_ROUNDS),
      fullName: input.fullName,
      role: 'CEO',
    });

    // Never log the password — it is in the operator's shell already.
    console.log(`Bootstrapped tenant '${input.slug}' (${tenant.id})`);
    console.log(`Administrator: ${input.email} (role CEO)`);
    console.log('Log in with the tenant slug, that email, and the password you supplied.');
  } finally {
    await pool.end();
  }
};

// `require.main` is undefined when this module is imported by the unit test.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
