import { Injectable } from '@nestjs/common';
import { and, count, eq, gte, isNull, lte, ne, sql, sum } from 'drizzle-orm';

import {
  assets,
  breakdowns,
  customers,
  maintenanceContracts,
  projects,
  users,
} from '../../database/schema';
import type { ProjectStatus } from '../../database/schema/projects';
import { TenantDbService } from '../../database/tenant-db.service';

export interface PipelineStage {
  status: ProjectStatus;
  count: number;
  valueEtb: string;
}

export interface UpcomingService {
  contractId: string;
  assetName: string;
  customerName: string;
  nextServiceAt: string;
  overdue: boolean;
}

export interface DashboardSummary {
  pipeline: PipelineStage[];
  openPipelineValueEtb: string;
  wonThisMonth: { count: number; valueEtb: string };
  servicesDueThisWeek: number;
  servicesOverdue: number;
  openBreakdowns: number;
  emergencyBreakdowns: number;
  totals: { customers: number; assets: number; employees: number };
  upcomingServices: UpcomingService[];
}

/** Stages a project can still be won from — excludes COMPLETED and CANCELLED. */
const OPEN_STAGES: readonly ProjectStatus[] = [
  'LEAD',
  'SITE_SURVEY',
  'SPEC_CALCULATION',
  'QUOTATION',
  'PROFORMA',
  'CONTRACT',
  'EXECUTION',
];

const money = (value: string | number | null): string =>
  Number(value ?? 0).toFixed(2);

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

@Injectable()
export class DashboardRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * One transaction, one tenant context, all figures for the landing page.
   * Every query is a COUNT/SUM aggregate — no rows are shipped to the app
   * except the short upcoming-services list.
   */
  async summary(tenantId: string): Promise<DashboardSummary> {
    const today = todayIso();
    const weekAhead = addDays(today, 7);
    const monthStart = `${today.slice(0, 7)}-01`;

    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const live = isNull(projects.deletedAt);

      const stageRows = await tx
        .select({
          status: projects.status,
          count: count(),
          valueEtb: sum(
            sql`coalesce(${projects.contractAmountEtb}, ${projects.quotedAmountEtb}, 0)`,
          ),
        })
        .from(projects)
        .where(live)
        .groupBy(projects.status);

      const byStatus = new Map(stageRows.map((row) => [row.status, row]));
      const pipeline = OPEN_STAGES.map((status) => ({
        status,
        count: Number(byStatus.get(status)?.count ?? 0),
        valueEtb: money(byStatus.get(status)?.valueEtb ?? 0),
      }));

      const openPipelineValueEtb = money(
        pipeline.reduce((total, stage) => total + Number(stage.valueEtb), 0),
      );

      const [won] = await tx
        .select({
          count: count(),
          valueEtb: sum(
            sql`coalesce(${projects.contractAmountEtb}, ${projects.quotedAmountEtb}, 0)`,
          ),
        })
        .from(projects)
        .where(
          and(
            live,
            // statusChangedAt is when it entered its current stage, so this is
            // "reached CONTRACT or beyond during the current month".
            sql`${projects.status} in ('CONTRACT', 'EXECUTION', 'COMPLETED')`,
            gte(projects.statusChangedAt, new Date(`${monthStart}T00:00:00Z`)),
          ),
        );

      const activeContract = and(
        isNull(maintenanceContracts.deletedAt),
        eq(maintenanceContracts.status, 'ACTIVE'),
      );

      const [dueThisWeek] = await tx
        .select({ count: count() })
        .from(maintenanceContracts)
        .where(
          and(
            activeContract,
            gte(maintenanceContracts.nextServiceAt, today),
            lte(maintenanceContracts.nextServiceAt, weekAhead),
          ),
        );

      const [overdue] = await tx
        .select({ count: count() })
        .from(maintenanceContracts)
        .where(
          and(activeContract, sql`${maintenanceContracts.nextServiceAt} < ${today}`),
        );

      const liveBreakdown = and(
        isNull(breakdowns.deletedAt),
        ne(breakdowns.status, 'DONE'),
      );

      const [openBreakdowns] = await tx
        .select({ count: count() })
        .from(breakdowns)
        .where(liveBreakdown);

      const [emergencies] = await tx
        .select({ count: count() })
        .from(breakdowns)
        .where(and(liveBreakdown, eq(breakdowns.severity, 'EMERGENCY')));

      const [customerTotal] = await tx
        .select({ count: count() })
        .from(customers)
        .where(isNull(customers.deletedAt));

      const [assetTotal] = await tx
        .select({ count: count() })
        .from(assets)
        .where(isNull(assets.deletedAt));

      const [employeeTotal] = await tx
        .select({ count: count() })
        .from(users)
        .where(and(isNull(users.deletedAt), ne(users.role, 'CUSTOMER')));

      const upcoming = await tx
        .select({
          contractId: maintenanceContracts.id,
          assetName: assets.name,
          customerName: customers.name,
          nextServiceAt: maintenanceContracts.nextServiceAt,
        })
        .from(maintenanceContracts)
        .innerJoin(
          assets,
          and(
            eq(assets.tenantId, maintenanceContracts.tenantId),
            eq(assets.id, maintenanceContracts.assetId),
          ),
        )
        .innerJoin(
          customers,
          and(
            eq(customers.tenantId, maintenanceContracts.tenantId),
            eq(customers.id, maintenanceContracts.customerId),
          ),
        )
        .where(and(activeContract, lte(maintenanceContracts.nextServiceAt, weekAhead)))
        .orderBy(maintenanceContracts.nextServiceAt)
        .limit(8);

      return {
        pipeline,
        openPipelineValueEtb,
        wonThisMonth: {
          count: Number(won?.count ?? 0),
          valueEtb: money(won?.valueEtb ?? 0),
        },
        servicesDueThisWeek: Number(dueThisWeek?.count ?? 0),
        servicesOverdue: Number(overdue?.count ?? 0),
        openBreakdowns: Number(openBreakdowns?.count ?? 0),
        emergencyBreakdowns: Number(emergencies?.count ?? 0),
        totals: {
          customers: Number(customerTotal?.count ?? 0),
          assets: Number(assetTotal?.count ?? 0),
          employees: Number(employeeTotal?.count ?? 0),
        },
        upcomingServices: upcoming.map((row) => ({
          ...row,
          overdue: row.nextServiceAt < today,
        })),
      };
    });
  }
}
