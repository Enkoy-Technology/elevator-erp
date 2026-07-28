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
import type { TenantTransaction } from '../../database/database.types';
import { TenantDbService } from '../../database/tenant-db.service';
import type { UserRole } from '../../types/auth.types';

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

export interface SalesFigures {
  pipeline: PipelineStage[];
  openPipelineValueEtb: string;
  wonThisMonth: { count: number; valueEtb: string };
}

export interface ServiceFigures {
  servicesDueThisWeek: number;
  servicesOverdue: number;
  openBreakdowns: number;
  emergencyBreakdowns: number;
  upcomingServices: UpcomingService[];
}

/**
 * Sections are omitted, not blanked, for roles that shouldn't see them — a
 * field engineer never receives deal values over the wire at all.
 */
export interface DashboardSummary {
  sales?: SalesFigures;
  service?: ServiceFigures;
  totals?: { customers: number; assets: number; employees: number };
}

/** Roles that may see money: deal values and pipeline totals. */
const SALES_ROLES: readonly UserRole[] = [
  'CEO',
  'ADMIN',
  'SALES_MANAGER',
  'FINANCE',
];

/** Roles that run or dispatch service work. */
const SERVICE_ROLES: readonly UserRole[] = [
  'CEO',
  'ADMIN',
  'TECHNICAL_LEAD',
  'FIELD_ENGINEER',
  'DISPATCHER',
];

/** Roles that may see headcount and the customer book size. */
const TOTALS_ROLES: readonly UserRole[] = [
  'CEO',
  'ADMIN',
  'SALES_MANAGER',
  'FINANCE',
  'TECHNICAL_LEAD',
];

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
   * One transaction, one tenant context, the figures this role is entitled to.
   * Every query is a COUNT/SUM aggregate — no rows are shipped to the app
   * except the short upcoming-services list. Sections the role cannot see are
   * never queried, so they cost nothing and cannot leak.
   */
  async summary(tenantId: string, role: UserRole): Promise<DashboardSummary> {
    const today = todayIso();
    const weekAhead = addDays(today, 7);
    const monthStart = `${today.slice(0, 7)}-01`;

    const wantsSales = SALES_ROLES.includes(role);
    const wantsService = SERVICE_ROLES.includes(role);
    const wantsTotals = TOTALS_ROLES.includes(role);

    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const summary: DashboardSummary = {};

      if (wantsSales) {
        summary.sales = await this.salesFigures(tx, monthStart);
      }
      if (wantsService) {
        summary.service = await this.serviceFigures(tx, today, weekAhead);
      }
      if (wantsTotals) {
        summary.totals = await this.totals(tx);
      }

      return summary;
    });
  }

  private async salesFigures(
    tx: TenantTransaction,
    monthStart: string,
  ): Promise<SalesFigures> {
    {
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

      return {
        pipeline,
        openPipelineValueEtb,
        wonThisMonth: {
          count: Number(won?.count ?? 0),
          valueEtb: money(won?.valueEtb ?? 0),
        },
      };
    }
  }

  private async serviceFigures(
    tx: TenantTransaction,
    today: string,
    weekAhead: string,
  ): Promise<ServiceFigures> {
    {
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
        servicesDueThisWeek: Number(dueThisWeek?.count ?? 0),
        servicesOverdue: Number(overdue?.count ?? 0),
        openBreakdowns: Number(openBreakdowns?.count ?? 0),
        emergencyBreakdowns: Number(emergencies?.count ?? 0),
        upcomingServices: upcoming.map((row) => ({
          ...row,
          overdue: row.nextServiceAt < today,
        })),
      };
    }
  }

  private async totals(
    tx: TenantTransaction,
  ): Promise<NonNullable<DashboardSummary['totals']>> {
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

    return {
      customers: Number(customerTotal?.count ?? 0),
      assets: Number(assetTotal?.count ?? 0),
      employees: Number(employeeTotal?.count ?? 0),
    };
  }
}
