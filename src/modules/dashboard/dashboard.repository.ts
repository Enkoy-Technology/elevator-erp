import { Injectable } from '@nestjs/common';
import { and, count, eq, gte, isNull, lt, lte, ne, sql, sum } from 'drizzle-orm';

import { BUSINESS_TIMEZONE, todayIso } from '../../common/business-time';
import {
  assets,
  breakdowns,
  customers,
  invoices,
  maintenanceContracts,
  paymentAllocations,
  payments,
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
 * The AR position, on the aging report's definition of "outstanding"
 * (per-invoice: totalEtb - whtEtb - allocations, VOID excluded), NOT
 * `customers.outstandingBalanceEtb` — that one is a net account position and
 * carries an unapplied-cash term, so the two legitimately differ. See
 * InvoicesRepository.agingReport's doc comment.
 */
export interface FinanceFigures {
  /** Payments received this calendar month, Addis time. Reversals net out. */
  revenueThisMonthEtb: string;
  outstandingTotalEtb: string;
  /** The part of `outstandingTotalEtb` whose dueDate is already past. */
  overdueTotalEtb: string;
  overdueInvoiceCount: number;
  /** Invoices with any balance left, overdue or not. */
  outstandingInvoiceCount: number;
  /**
   * The same ageing buckets the receivables report shows, summed from the
   * same balances expression — so the dashboard chart and the report can
   * never disagree. A null dueDate is `current`, never aged.
   */
  agingBuckets: {
    currentEtb: string;
    d1_30Etb: string;
    d31_60Etb: string;
    d61_90Etb: string;
    d90PlusEtb: string;
  };
  /**
   * Twelve months of collections, oldest first, zero-filled, `YYYY-MM` in
   * Addis local time. Always twelve entries so a chart never has to decide
   * whether a gap means "no data" or "no money".
   */
  collectionsByMonth: { month: string; totalEtb: string }[];
}

/**
 * Sections are omitted, not blanked, for roles that shouldn't see them — a
 * field engineer never receives deal values over the wire at all.
 */
export interface DashboardSummary {
  sales?: SalesFigures;
  service?: ServiceFigures;
  finance?: FinanceFigures;
  totals?: { customers: number; assets: number; employees: number };
}

/** Roles that may see money: deal values and pipeline totals. */
const SALES_ROLES: readonly UserRole[] = [
  'CEO',
  'ADMIN',
  'SALES_MANAGER',
  'FINANCE',
];

/** Roles that may see the accounts-receivable book. */
const FINANCE_ROLES: readonly UserRole[] = ['CEO', 'ADMIN', 'FINANCE'];

/** Roles that run or dispatch service work. */
const SERVICE_ROLES: readonly UserRole[] = [
  'CEO',
  'ADMIN',
  'TECHNICAL_LEAD',
  'FIELD_ENGINEER',
  'DISPATCHER',
];

/**
 * Roles that may see headcount and the customer book size. WAREHOUSE_MANAGER
 * is here because the equipment count is the only figure they own — without it
 * their dashboard is empty and the role has nothing to land on.
 */
const TOTALS_ROLES: readonly UserRole[] = [
  'CEO',
  'ADMIN',
  'SALES_MANAGER',
  'FINANCE',
  'TECHNICAL_LEAD',
  'WAREHOUSE_MANAGER',
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

/** The instant at which a business-local calendar day begins. */
const businessDayStart = (isoDate: string): Date => {
  // Probe at midday so a DST transition can never land on the sample.
  const probe = new Date(`${isoDate}T12:00:00Z`);
  const offsetMs =
    new Date(probe.toLocaleString('en-US', { timeZone: BUSINESS_TIMEZONE }))
      .getTime() -
    new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() - offsetMs);
};

/** First day of the month after the one `monthStartIso` (always a -01) begins. */
const nextMonthStart = (monthStartIso: string): string => {
  const date = new Date(`${monthStartIso}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
};

/** The first of the month `count` months before `monthStartIso` (a -01). */
const monthsBack = (monthStartIso: string, count: number): string => {
  const date = new Date(`${monthStartIso}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - count);
  return date.toISOString().slice(0, 10);
};

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
    // Inclusive on both ends, so +6 is a 7-day window. +7 counted the same
    // service in two consecutive weeks.
    const weekAhead = addDays(today, 6);
    const monthStart = `${today.slice(0, 7)}-01`;

    const wantsSales = SALES_ROLES.includes(role);
    const wantsFinance = FINANCE_ROLES.includes(role);
    const wantsService = SERVICE_ROLES.includes(role);
    const wantsTotals = TOTALS_ROLES.includes(role);

    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const summary: DashboardSummary = {};

      if (wantsSales) {
        summary.sales = await this.salesFigures(tx, monthStart);
      }
      if (wantsFinance) {
        summary.finance = await this.financeFigures(tx, today, monthStart);
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
            // wonAt is stamped once, on entering CONTRACT — unlike
            // statusChangedAt it doesn't reset (and double-count) when the
            // project advances to EXECUTION or COMPLETED later. A deal won
            // and then cancelled in the same month no longer counts.
            gte(projects.wonAt, businessDayStart(monthStart)),
            ne(projects.status, 'CANCELLED'),
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

  /**
   * Two aggregates, no invoice rows shipped to the app. The balance subquery
   * is the aging report's own per-invoice formula (total - wht - allocations,
   * VOID excluded, positive balances only) expressed in SQL rather than
   * imported, because `/modules/dashboard` may not import from
   * `/modules/invoices` and the module's contract is that every dashboard
   * query is an aggregate.
   */
  private async financeFigures(
    tx: TenantTransaction,
    today: string,
    monthStart: string,
  ): Promise<FinanceFigures> {
    // A reversal is a negative payment row, so the month's sum nets itself.
    const [revenue] = await tx
      .select({ total: sum(payments.amountEtb) })
      .from(payments)
      .where(
        and(
          gte(payments.receivedAt, businessDayStart(monthStart)),
          lt(payments.receivedAt, businessDayStart(nextMonthStart(monthStart))),
        ),
      );

    const balances = tx
      .select({
        dueDate: invoices.dueDate,
        balanceEtb:
          sql<string>`${invoices.totalEtb} - ${invoices.whtEtb} - coalesce(sum(${paymentAllocations.amountEtb}), 0)`.as(
            'balance_etb',
          ),
      })
      .from(invoices)
      .leftJoin(
        paymentAllocations,
        and(
          eq(paymentAllocations.tenantId, invoices.tenantId),
          eq(paymentAllocations.invoiceId, invoices.id),
        ),
      )
      .where(ne(invoices.status, 'VOID'))
      .groupBy(
        invoices.tenantId,
        invoices.id,
        invoices.dueDate,
        invoices.totalEtb,
        invoices.whtEtb,
      )
      .as('balances');

    // A null dueDate is never overdue — same rule as the aging report, where
    // it lands in `current` rather than being aged from issuedAt.
    const overdue = sql`${balances.dueDate} < ${today}::date`;

    const [ar] = await tx
      .select({
        outstandingTotal: sql<string>`coalesce(sum(${balances.balanceEtb}), 0)`,
        overdueTotal: sql<string>`coalesce(sum(${balances.balanceEtb}) filter (where ${overdue}), 0)`,
        overdueCount: sql<string>`count(*) filter (where ${overdue})`,
        outstandingCount: sql<string>`count(*)`,
      })
      .from(balances)
      .where(sql`${balances.balanceEtb} > 0`);

    // Ageing on the same balances subquery the totals above use, so the
    // chart and the headline can never disagree. Day counts come off
    // dueDate exactly as invoice-aging.ts defines them; a null dueDate is
    // `current`, never aged.
    const overdueDays = sql`(${today}::date - ${balances.dueDate})`;
    const [buckets] = await tx
      .select({
        current: sql<string>`coalesce(sum(${balances.balanceEtb}) filter (where ${balances.dueDate} is null or ${overdueDays} <= 0), 0)`,
        d1_30: sql<string>`coalesce(sum(${balances.balanceEtb}) filter (where ${overdueDays} between 1 and 30), 0)`,
        d31_60: sql<string>`coalesce(sum(${balances.balanceEtb}) filter (where ${overdueDays} between 31 and 60), 0)`,
        d61_90: sql<string>`coalesce(sum(${balances.balanceEtb}) filter (where ${overdueDays} between 61 and 90), 0)`,
        d90_plus: sql<string>`coalesce(sum(${balances.balanceEtb}) filter (where ${overdueDays} > 90), 0)`,
      })
      .from(balances)
      .where(sql`${balances.balanceEtb} > 0`);

    // Twelve months of collections, bucketed in Addis local time rather than
    // UTC — a payment taken at 01:00 Addis belongs to that day, not to the
    // previous one. Grouped in SQL so no payment rows cross the wire.
    const monthly = await tx
      .select({
        month: sql<string>`to_char(date_trunc('month', ${payments.receivedAt} at time zone ${BUSINESS_TIMEZONE}), 'YYYY-MM')`,
        total: sql<string>`coalesce(sum(${payments.amountEtb}), 0)`,
      })
      .from(payments)
      .where(gte(payments.receivedAt, businessDayStart(monthsBack(monthStart, 11))))
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const byMonth = new Map(monthly.map((row) => [row.month, row.total]));

    return {
      revenueThisMonthEtb: money(revenue?.total ?? 0),
      outstandingTotalEtb: money(ar?.outstandingTotal ?? 0),
      overdueTotalEtb: money(ar?.overdueTotal ?? 0),
      overdueInvoiceCount: Number(ar?.overdueCount ?? 0),
      outstandingInvoiceCount: Number(ar?.outstandingCount ?? 0),
      agingBuckets: {
        currentEtb: money(buckets?.current ?? 0),
        d1_30Etb: money(buckets?.d1_30 ?? 0),
        d31_60Etb: money(buckets?.d31_60 ?? 0),
        d61_90Etb: money(buckets?.d61_90 ?? 0),
        d90PlusEtb: money(buckets?.d90_plus ?? 0),
      },
      // Always twelve entries, oldest first, zero-filled — a chart must not
      // have to guess whether a missing month means "no data" or "no money".
      collectionsByMonth: Array.from({ length: 12 }, (_unused, index) => {
        const month = monthsBack(monthStart, 11 - index);
        return { month: month.slice(0, 7), totalEtb: money(byMonth.get(month.slice(0, 7)) ?? 0) };
      }),
    };
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
