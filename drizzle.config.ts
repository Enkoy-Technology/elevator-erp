import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Admin URL: migrations require table-owner privileges (RLS setup).
    url:
      process.env.DATABASE_ADMIN_URL ??
      'postgresql://postgres:postgres@localhost:5434/elevator_erp',
  },
  strict: true,
  verbose: true,
});
