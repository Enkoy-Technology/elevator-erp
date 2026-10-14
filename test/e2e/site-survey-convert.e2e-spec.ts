/**
 * Converting a site survey: the customer (new or picked), a LEAD project,
 * and the sheet's link to both land in one transaction, and a sheet is
 * converted once. Runs the real repository as `app_user`, so RLS applies.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself only with ALLOW_E2E_SKIP=1 (see tenant-isolation.e2e-spec.ts).
 */
import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { SiteSurveyConvertedError } from '../../src/common/exceptions';
import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { SiteSurveysRepository } from '../../src/modules/site-surveys/site-surveys.repository';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://postgres:postgres@localhost:5434/elevator_erp';
const APP_URL =
  process.env.DATABASE_URL ??
  'postgresql://app_user:app_password@localhost:5434/elevator_erp';

const canConnect = async (url: string): Promise<boolean> => {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
};

describe('Site survey -> customer + project', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;
  let repo: SiteSurveysRepository;

  const slug = `survey-convert-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let salespersonId: string;
  let managerId: string;

  const countRows = async (table: 'customers' | 'projects') =>
    (
      await adminPool.query<{ n: number }>(
        `select count(*)::int as n from ${table} where tenant_id = $1`,
        [tenantId],
      )
    ).rows[0]!.n;

  const newSurvey = async (projectName: string) =>
    repo.create(tenantId, salespersonId, {
      projectName,
      address: 'Bole, behind Friendship',
      contactName: 'Ato Abebe',
      contactPhone: '0911234567',
      shaftWidthMm: 2000,
      shaftDepthMm: 1800,
      floors: 'B+G+11',
      productType: 'PASSENGER',
      capacityKg: 630,
    });

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Site survey convert e2e could not reach Postgres. ' +
        'Run `docker compose up -d && pnpm run db:migrate` first, ' +
        'or set ALLOW_E2E_SKIP=1 to skip deliberately.';
      if (process.env.ALLOW_E2E_SKIP !== '1') {
        throw new Error(message);
      }
      // eslint-disable-next-line no-console
      console.warn(`SKIPPED — ${message}`);
      return;
    }
    adminPool = new Pool({ connectionString: ADMIN_URL, max: 2 });
    appPool = new Pool({ connectionString: APP_URL, max: 2 });
    repo = new SiteSurveysRepository(
      new TenantDbService(drizzle(appPool, { schema })),
    );

    const tenant = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name, subscription_status, fiscal_year_start)
       values ($1, $2, 'ACTIVE', '07-08') returning id`,
      [slug, `Survey convert ${slug}`],
    );
    tenantId = tenant.rows[0]!.id;
    const user = async (role: string) =>
      (
        await adminPool.query<{ id: string }>(
          `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
           values ($1, $2, 'x', $3, $4, true) returning id`,
          [tenantId, `${role.toLowerCase()}@${slug}.example.com`, role, role],
        )
      ).rows[0]!.id;
    salespersonId = await user('SALESPERSON');
    managerId = await user('SALES_MANAGER');
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    for (const table of ['site_surveys', 'projects', 'customers', 'users']) {
      await adminPool.query(`delete from ${table} where tenant_id = $1`, [
        tenantId,
      ]);
    }
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await Promise.all([adminPool.end(), appPool.end()]);
  });

  it('opens a new customer and a LEAD project, and links the sheet', async () => {
    if (!available) return;
    const survey = await newSurvey('Bole Plaza');
    expect(survey).toMatchObject({ productType: 'PASSENGER', capacityKg: 630 });

    const { customerId, projectId } = await repo.convert(
      tenantId,
      managerId,
      survey.id,
      {
        customer: { name: 'Ato Abebe', phone: '0911234567' },
        project: { name: 'Bole Plaza', productType: 'PASSENGER' },
      },
    );

    const project = await adminPool.query(
      `select status, customer_id, product_type, sales_rep_user_id
         from projects where tenant_id = $1 and id = $2`,
      [tenantId, projectId],
    );
    expect(project.rows[0]).toEqual({
      status: 'LEAD',
      customer_id: customerId,
      product_type: 'PASSENGER',
      // The salesperson who surveyed the site owns the lead.
      sales_rep_user_id: salespersonId,
    });
    const linked = await repo.findById(tenantId, survey.id);
    expect(linked).toMatchObject({ customerId, projectId });

    // Converted once: a second try opens nothing.
    await expect(
      repo.convert(tenantId, managerId, survey.id, {
        customerId,
        project: { name: 'Bole Plaza again' },
      }),
    ).rejects.toBeInstanceOf(SiteSurveyConvertedError);
    const count = await adminPool.query(
      `select count(*)::int as n from projects where tenant_id = $1`,
      [tenantId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('picks an existing customer, and leaves nothing behind on failure', async () => {
    if (!available) return;
    const [existing] = (
      await adminPool.query<{ id: string }>(
        `select id from customers where tenant_id = $1 limit 1`,
        [tenantId],
      )
    ).rows;
    const second = await newSurvey('Kazanchis Tower');
    const { customerId } = await repo.convert(tenantId, managerId, second.id, {
      customerId: existing!.id,
      project: { name: 'Kazanchis Tower' },
    });
    expect(customerId).toBe(existing!.id);

    // An unknown customer is refused before anything is written.
    const third = await newSurvey('Piassa Mall');
    await expect(
      repo.convert(tenantId, managerId, third.id, {
        customerId: randomUUID(),
        project: { name: 'Piassa Mall' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // A project that fails AFTER the new customer is inserted (a sales rep
    // who does not exist breaks its foreign key) takes the customer with it.
    const customersBefore = await countRows('customers');
    await expect(
      repo.convert(tenantId, managerId, third.id, {
        customer: { name: 'W/ro Rollback', phone: '0933445566' },
        project: { name: 'Piassa Mall', salesRepUserId: randomUUID() },
      }),
    ).rejects.toThrow();
    expect(await countRows('customers')).toBe(customersBefore);
    expect(await repo.findById(tenantId, third.id)).toMatchObject({
      customerId: null,
      projectId: null,
    });
  });
});
