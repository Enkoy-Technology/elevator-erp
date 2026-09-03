import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

type Db = NodePgDatabase<typeof schema>;

/**
 * The customers and projects the demo opens with.
 *
 * `seed.ts` creates the tenant, its nine role accounts and the standing
 * document text — everything the system needs to WORK. It deliberately
 * creates no business records, which is right for a fresh production tenant
 * and wrong for a demonstration: a client who opens the ERP to eight empty
 * tables cannot tell a working system from a broken one, and the dashboard
 * charts have nothing to draw.
 *
 * So this is separate and opt-in. Never run it against a real tenant.
 *
 * The names are recognisable Addis Ababa buildings and firms because a demo
 * is a rehearsal: a sales manager should see the kind of row they will
 * actually type, not Acme Corp. The pipeline stages are spread deliberately
 * so the projects board shows every column populated and every stage
 * transition button reachable.
 */
export interface DemoCustomer {
  name: string;
  customerType: 'RESIDENTIAL' | 'COMMERCIAL' | 'GOVERNMENT';
  email: string;
  phone: string;
  city: string;
  buildingName?: string;
  projects: DemoProject[];
}

export interface DemoProject {
  name: string;
  status:
    | 'LEAD'
    | 'SITE_SURVEY'
    | 'SPEC_CALCULATION'
    | 'QUOTATION'
    | 'PROFORMA'
    | 'CONTRACT'
    | 'EXECUTION'
    | 'COMPLETED';
  /** Only where the stage has got far enough to have a number. */
  quotedAmountEtb?: string;
  contractAmountEtb?: string;
}

export const DEMO_CUSTOMERS: readonly DemoCustomer[] = [
  {
    name: 'Ayat Real Estate S.C.',
    customerType: 'COMMERCIAL',
    email: 'projects@ayat.example',
    phone: '+251111234567',
    city: 'Addis Ababa',
    buildingName: 'Ayat Tower, Bole Medhanialem',
    projects: [
      {
        name: 'Ayat Tower — Passenger Lifts 1-2',
        status: 'CONTRACT',
        quotedAmountEtb: '8521500.00',
        contractAmountEtb: '7835000.00',
      },
      { name: 'Ayat Zone 4 — Block C Lift', status: 'SITE_SURVEY' },
    ],
  },
  {
    name: 'Ethio Hospital PLC',
    customerType: 'COMMERCIAL',
    email: 'facility@ethiohospital.example',
    phone: '+251115512340',
    city: 'Addis Ababa',
    buildingName: 'Ethio Hospital, Kirkos',
    projects: [
      {
        name: 'Ethio Hospital — Bed Elevator Block B',
        status: 'PROFORMA',
        quotedAmountEtb: '9120000.00',
      },
    ],
  },
  {
    name: 'Nib International Bank',
    customerType: 'COMMERCIAL',
    email: 'premises@nib.example',
    phone: '+251115503000',
    city: 'Addis Ababa',
    buildingName: 'Nib Headquarters, Kazanchis',
    projects: [
      {
        name: 'Nib HQ — Lifts 1-2',
        status: 'QUOTATION',
        quotedAmountEtb: '9600000.00',
      },
    ],
  },
  {
    name: 'Edna Mall',
    customerType: 'COMMERCIAL',
    email: 'operations@ednamall.example',
    phone: '+251116636363',
    city: 'Addis Ababa',
    buildingName: 'Edna Mall, Bole',
    projects: [
      {
        name: 'Edna Mall — Escalators Ground to 1F',
        status: 'EXECUTION',
        quotedAmountEtb: '6400000.00',
        contractAmountEtb: '6000000.00',
      },
    ],
  },
  {
    name: 'Sunshine Construction PLC',
    customerType: 'COMMERCIAL',
    email: 'admin@sunshine.example',
    phone: '+251114670000',
    city: 'Addis Ababa',
    projects: [
      { name: 'Summit Residences — Lift A', status: 'LEAD' },
      {
        name: 'CMC Apartments — Lifts 1-3',
        status: 'SPEC_CALCULATION',
      },
    ],
  },
  {
    name: 'Addis Ababa University',
    customerType: 'GOVERNMENT',
    email: 'estates@aau.example',
    phone: '+251111239797',
    city: 'Addis Ababa',
    buildingName: 'Science Faculty, Arat Kilo',
    projects: [
      {
        name: 'AAU Science Block — Passenger Lift',
        status: 'COMPLETED',
        quotedAmountEtb: '5900000.00',
        contractAmountEtb: '5750000.00',
      },
    ],
  },
  {
    name: 'Flintstone Homes',
    customerType: 'COMMERCIAL',
    email: 'sales@flintstone.example',
    phone: '+251116187000',
    city: 'Addis Ababa',
    projects: [{ name: 'Lebu Estate — Lift B', status: 'SITE_SURVEY' }],
  },
  {
    name: 'Ato Getu Gelete',
    customerType: 'RESIDENTIAL',
    email: 'getu.gelete@example.com',
    phone: '+251911675505',
    city: 'Addis Ababa',
    projects: [
      {
        name: 'Private Residence — Home Lift',
        status: 'QUOTATION',
        quotedAmountEtb: '7835000.00',
      },
    ],
  },
];

/**
 * Idempotent per RECORD, matched on (tenant, name) — re-running tops up
 * anything missing and never duplicates, so a half-finished run can simply
 * be run again. Returns what it actually inserted, so the caller can say
 * whether it did anything.
 */
export const seedDemoBusinessData = async (
  db: Db,
  tenantId: string,
): Promise<{ customers: number; projects: number }> => {
  let customersAdded = 0;
  let projectsAdded = 0;

  for (const demo of DEMO_CUSTOMERS) {
    const [existing] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.tenantId, tenantId),
          eq(schema.customers.name, demo.name),
        ),
      )
      .limit(1);

    let customerId = existing?.id;
    if (!customerId) {
      const [row] = await db
        .insert(schema.customers)
        .values({
          tenantId,
          name: demo.name,
          customerType: demo.customerType,
          email: demo.email,
          phone: demo.phone,
          city: demo.city,
          country: 'ET',
          buildingName: demo.buildingName,
        })
        .returning({ id: schema.customers.id });
      if (!row) {
        throw new Error(`Failed to insert demo customer ${demo.name}`);
      }
      customerId = row.id;
      customersAdded += 1;
    }

    for (const project of demo.projects) {
      const [alreadyThere] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.tenantId, tenantId),
            eq(schema.projects.name, project.name),
          ),
        )
        .limit(1);
      if (alreadyThere) {
        continue;
      }
      await db.insert(schema.projects).values({
        tenantId,
        customerId,
        name: project.name,
        status: project.status,
        siteCity: demo.city,
        siteCountry: 'ET',
        buildingName: demo.buildingName,
        quotedAmountEtb: project.quotedAmountEtb,
        contractAmountEtb: project.contractAmountEtb,
      });
      projectsAdded += 1;
    }
  }

  return { customers: customersAdded, projects: projectsAdded };
};
