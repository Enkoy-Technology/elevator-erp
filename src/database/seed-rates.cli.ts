/* eslint-disable no-console */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { RatesRepository } from '../modules/rates/rates.repository';
import { seedRates } from '../modules/rates/seed-rates';
import * as schema from './schema';

// Production entrypoint for statutory rates: unlike seed.ts's demo tenant,
// these are not demo data, so there is deliberately no ALLOW_DEMO_SEED gate.
// Safe (and required) to run on every deploy, including production.
const main = async (): Promise<void> => {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL must be set');
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    await seedRates(new RatesRepository(db));
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
