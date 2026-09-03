/* eslint-disable no-console */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

import * as schema from './schema';
import { assertSeedAllowed, openAdminPool, seedDemoData } from './seed';

/**
 * One command that takes an empty managed database (Neon) to a demo-ready
 * state, for the FREE PUBLIC DEMO only:
 *
 *   ALLOW_DEMO_SEED=1 \
 *   DATABASE_ADMIN_URL=... DATABASE_URL=... OUTBOX_DISPATCHER_DATABASE_URL=... \
 *   pnpm run db:demo:bootstrap
 *
 * or, against the built image (no node_modules needed):
 *
 *   docker run --rm --platform linux/amd64 \
 *     -e ALLOW_DEMO_SEED=1 -e DATABASE_ADMIN_URL=... -e DATABASE_URL=... \
 *     -e OUTBOX_DISPATCHER_DATABASE_URL=... \
 *     "$IMAGE" node dist/database/demo-bootstrap.js
 *
 * It runs: migrate → rotate the two application role passwords → seed rates,
 * the fictional demo tenant, its nine role accounts and the document
 * boilerplate. Every step is idempotent, so re-running it is the documented
 * way to repair a half-finished bootstrap.
 *
 * ⚠ LEGAL — Proclamation 1321/2024 Art 22(1) requires personal data collected
 * in Ethiopia to be stored on a server in Ethiopia. Cloud Run and Neon are
 * abroad, so this database is lawful only while everything in it is invented.
 * That is why this entrypoint sits behind ALLOW_DEMO_SEED and seeds the demo
 * tenant rather than bootstrapping a real one: the real client deployment is
 * `docs/ops/deploy-runbook.md` + `db:bootstrap`, on a server in Ethiopia, and
 * nothing here replaces it.
 *
 * Why the password rotation is part of this and not a separate step: migration
 * `0001` creates `app_user` with the literal password `app_password` (and
 * `0049` creates `outbox_dispatcher` with `dispatcher_password`) when the role
 * does not exist yet. Both defaults are in this public repository, and a Neon
 * endpoint answers the whole internet — so a demo left on them is a database
 * anyone can open. Taking the real passwords out of the connection strings the
 * app is *already* configured with keeps one source of truth and removes the
 * step an operator can silently skip.
 */

/** role name -> the password migrations create it with. Never deploy these. */
const COMMITTED_DEFAULTS: ReadonlyArray<{ envVar: string; role: string; committed: string }> = [
  { envVar: 'DATABASE_URL', role: 'app_user', committed: 'app_password' },
  {
    envVar: 'OUTBOX_DISPATCHER_DATABASE_URL',
    role: 'outbox_dispatcher',
    committed: 'dispatcher_password',
  },
];

interface RoleCredential {
  role: string;
  password: string;
}

/** Pulls the role + password the running app will use out of its own URL. */
export const credentialFrom = (
  raw: string | undefined,
  envVar: string,
  expectedRole: string,
  committedDefault: string,
): RoleCredential => {
  if (!raw) {
    throw new Error(`${envVar} must be set (the connection string the app will use)`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${envVar} is not a valid connection URL`);
  }
  const role = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (role !== expectedRole) {
    throw new Error(
      `${envVar} must connect as '${expectedRole}', not '${role || '(none)'}'`,
    );
  }
  if (!password) {
    throw new Error(`${envVar} carries no password for '${expectedRole}'`);
  }
  if (password === committedDefault) {
    throw new Error(
      `${envVar} still carries the password migration defaults hardcode for ` +
        `'${expectedRole}'. It is published in this repository and this database ` +
        'is on the public internet — generate one (openssl rand -base64 24), put ' +
        'it in the connection string, and run this again.',
    );
  }
  return { role, password };
};

/** `ALTER ROLE … PASSWORD` takes no bind parameters, so pg escapes for us. */
const rotate = async (pool: Pool, { role, password }: RoleCredential): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(
      `ALTER ROLE ${client.escapeIdentifier(role)} PASSWORD ${client.escapeLiteral(password)}`,
    );
  } finally {
    client.release();
  }
  console.log(`Rotated the password for role '${role}'.`);
};

const main = async (): Promise<void> => {
  assertSeedAllowed(process.env);

  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error(
      'DATABASE_ADMIN_URL must be set (the owner role, on Neon the DIRECT endpoint — migrations need a real session, not the pooler)',
    );
  }
  // Read every credential before touching the database: a typo in the third
  // connection string should fail before the first migration runs.
  const credentials = COMMITTED_DEFAULTS.map((entry) =>
    credentialFrom(process.env[entry.envVar], entry.envVar, entry.role, entry.committed),
  );

  const pool = openAdminPool(adminUrl);
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'src/database/migrations' });
    console.log('Migrations applied.');

    for (const credential of credentials) {
      await rotate(pool, credential);
    }

    await seedDemoData(drizzle(pool, { schema }));
  } finally {
    await pool.end();
  }

  console.log(
    '\nDemo database ready. FICTIONAL DATA ONLY: this server is outside ' +
      'Ethiopia, and Proclamation 1321/2024 Art 22 requires personal data ' +
      'collected in Ethiopia to stay on a server in Ethiopia.',
  );
};

if (require.main === module) {
  main().catch((error: unknown) => {
    // Message only, never the error object: the connection strings this
    // script reads carry passwords.
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
