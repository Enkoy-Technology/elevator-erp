import { Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import Decimal from 'decimal.js';

import {
  addWorkingDaysIso,
  daysBetweenIso,
  todayIso,
  workingDaysBetweenIso,
} from '../../common/business-time';
import { DEFAULT_DELAY_PENALTY_PERCENT_PER_DAY } from '../../common/contract-defaults';
import { WorkflowTransitionError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { normalizeEthiopic } from '../../common/text/ethiopic-normalize';
import {
  contracts,
  customers,
  projects,
  type ProjectStatus,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { CreateProjectDto } from './dto/create-project.dto';

export type ProjectRecord = typeof projects.$inferSelect;
export type ProjectInsert = typeof projects.$inferInsert;

/**
 * A list row: the project, plus the delivery the customer was promised.
 * All three are null until a contract with a delivery period is signed,
 * and again once it is handed over (the contract is then COMPLETED) or the
 * project leaves CONTRACT/EXECUTION.
 */
export type ProjectListRow = ProjectRecord & {
  /** Signing date + the contract's delivery working days, ISO 'YYYY-MM-DD'. */
  deliveryDueDate: string | null;
  /** Working days (Mon–Fri) from today to that date; negative once it has passed. */
  deliveryDaysLeft: number | null;
  /** The delay penalty run up so far, ETB; null unless the delivery is overdue. */
  deliveryPenaltyEtb: string | null;
};

/** The stages a delivery is still owed in; a cancelled or completed project has no countdown. */
const DELIVERY_PENDING: readonly ProjectStatus[] = ['CONTRACT', 'EXECUTION'];

/** What the countdown reads off one signed contract. */
export interface SignedDelivery {
  signedAt: string;
  deliveryDays: number;
  contractValueEtb: string;
  /** Null: the contract states none, so the company default applies. */
  penaltyPercentPerDay: string | null;
  penaltyCapPercent: string | null;
}

/**
 * The countdown the list shows: the contract's delivery period — working
 * days, as its Article 3.2 states it — counted from the day it was signed.
 * With more than one signed contract on a project, the earliest promise is
 * the one that binds.
 *
 * Once that date has passed, Article 7.1 runs: the penalty percent of the
 * contract price for EACH day of delay — every calendar day, weekends
 * included — up to the contract's cap when it states one.
 */
export const deliveryCountdown = (
  signed: readonly SignedDelivery[],
  today: string,
): Pick<
  ProjectListRow,
  'deliveryDueDate' | 'deliveryDaysLeft' | 'deliveryPenaltyEtb'
> => {
  const first = signed
    .map((contract) => ({
      contract,
      due: addWorkingDaysIso(contract.signedAt, contract.deliveryDays),
    }))
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  if (!first) {
    return {
      deliveryDueDate: null,
      deliveryDaysLeft: null,
      deliveryPenaltyEtb: null,
    };
  }
  const { contract, due } = first;
  const daysLate = daysBetweenIso(due, today);
  const value = new Decimal(contract.contractValueEtb);
  const uncapped = value
    .mul(contract.penaltyPercentPerDay ?? DEFAULT_DELAY_PENALTY_PERCENT_PER_DAY)
    .div(100)
    .mul(daysLate);
  const penalty =
    contract.penaltyCapPercent === null
      ? uncapped
      : Decimal.min(uncapped, value.mul(contract.penaltyCapPercent).div(100));
  return {
    deliveryDueDate: due,
    deliveryDaysLeft: workingDaysBetweenIso(today, due),
    deliveryPenaltyEtb:
      daysLate > 0
        ? penalty.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
        : null,
  };
};

/** Same shape `list()`/`streamAll()` build the `q` filter with, mirroring
 * CustomersRepository.list()'s coalesce(nameNormalized, lower(name)) pattern
 * so an out-of-band row with a NULL nameNormalized never silently drops out
 * of search. */
const nameSearchFilter = (q: string) =>
  sql`coalesce(${projects.nameNormalized}, lower(${projects.name})) like ${`%${normalizeEthiopic(q.trim())}%`}`;

/** The filters `list()` and `streamAll()` both honor, in one place — so a
 * new filter cannot land on one path and silently miss the other. */
const listFilters = (options: {
  status?: ProjectStatus;
  customerId?: string;
  q?: string;
}) => {
  const filters = [isNull(projects.deletedAt)];
  if (options.status) {
    filters.push(eq(projects.status, options.status));
  }
  if (options.customerId) {
    filters.push(eq(projects.customerId, options.customerId));
  }
  if (options.q && options.q.trim().length > 0) {
    filters.push(nameSearchFilter(options.q));
  }
  return filters;
};

/** `streamAll()`'s row shape: the raw `customerId` FK is replaced (not
 * appended) with the joined customer's display name — see REC 5. */
export type ProjectExportRow = Omit<ProjectRecord, 'customerId'> & {
  customerName: string | null;
};

@Injectable()
export class ProjectsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      status?: ProjectStatus;
      customerId?: string;
      q?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ProjectListRow>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const where = and(...listFilters(options));
      const [totalRow] = await tx
        .select({ value: count() })
        .from(projects)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(projects)
        .where(where)
        .orderBy(desc(projects.createdAt))
        .limit(pageSize)
        .offset(offset);
      // One query for the page's signed contracts, not a join: a project
      // may carry several contracts and must still be one row.
      // ponytail: contracts has no (tenant_id, project_id) index, so this
      // scans the tenant's contracts; add the index when a tenant holds
      // thousands of them.
      const pendingIds = items
        .filter((project) => DELIVERY_PENDING.includes(project.status))
        .map((project) => project.id);
      const signed =
        pendingIds.length === 0
          ? []
          : await tx
              .select({
                projectId: contracts.projectId,
                signedAt: contracts.signedAt,
                deliveryDays: contracts.deliveryWorkingDays,
                contractValueEtb: contracts.contractValueEtb,
                penaltyPercentPerDay: contracts.delayPenaltyPercentPerDay,
                penaltyCapPercent: contracts.delayPenaltyCapPercent,
              })
              .from(contracts)
              .where(
                and(
                  inArray(contracts.projectId, pendingIds),
                  eq(contracts.status, 'SIGNED'),
                  isNotNull(contracts.signedAt),
                  isNotNull(contracts.deliveryWorkingDays),
                ),
              );
      const today = todayIso();
      const rows = items.map((project) => ({
        ...project,
        ...deliveryCountdown(
          signed.flatMap((c) =>
            c.projectId === project.id && c.signedAt && c.deliveryDays !== null
              ? [{ ...c, signedAt: c.signedAt, deliveryDays: c.deliveryDays }]
              : [],
          ),
          today,
        ),
      }));
      return toPaginatedResult(rows, total, page, pageSize);
    });
  }

  /**
   * Streams every project matching the same filters `list()` honors, for
   * bulk export, in batches of BATCH_SIZE.
   *
   * ponytail: offset batching, ties broken by the `id` tiebreaker below so
   * equal `createdAt` values (bulk import, seed data) no longer duplicate
   * or skip rows across batch boundaries — concurrent inserts/deletes can
   * still shift the offset window; acceptable for ad-hoc admin downloads,
   * switch to keyset cursor before this feeds accounting reconciliation.
   * Perf ceiling: keyset if large-tenant exports time out.
   *
   * Tenant-scoping subtlety: `app.tenant_id` is a transaction-local GUC
   * (set by `withTenant`), so each batch opens its own `withTenant`
   * transaction rather than reusing one `tx` across the whole generator.
   */
  async *streamAll(
    tenantId: string,
    options: { status?: ProjectStatus; customerId?: string; q?: string },
  ): AsyncGenerator<ProjectExportRow> {
    const BATCH_SIZE = 500;
    let offset = 0;
    const { customerId: _customerId, ...projectColumns } =
      getTableColumns(projects);
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        return tx
          .select({ ...projectColumns, customerName: customers.name })
          .from(projects)
          .leftJoin(
            customers,
            and(
              eq(projects.tenantId, customers.tenantId),
              eq(projects.customerId, customers.id),
            ),
          )
          .where(and(...listFilters(options)))
          .orderBy(desc(projects.createdAt), asc(projects.id))
          .limit(BATCH_SIZE)
          .offset(offset);
      });
      for (const row of batch) {
        yield row;
      }
      if (batch.length < BATCH_SIZE) {
        return;
      }
      offset += BATCH_SIZE;
    }
  }

  async findById(tenantId: string, id: string): Promise<ProjectRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async create(
    tenantId: string,
    createdByUserId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({
          tenantId,
          customerId: dto.customerId,
          name: dto.name,
          nameNormalized: normalizeEthiopic(dto.name),
          code: dto.code,
          productType: dto.productType ?? null,
          siteAddressLine1: dto.siteAddressLine1,
          siteAddressLine2: dto.siteAddressLine2,
          siteCity: dto.siteCity,
          siteRegion: dto.siteRegion,
          siteCountry: dto.siteCountry ?? 'ET',
          buildingName: dto.buildingName,
          salesRepUserId: dto.salesRepUserId,
          notes: dto.notes,
          createdByUserId,
          status: 'LEAD',
          statusChangedAt: new Date(),
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert project');
      }
      return row;
    });
  }

  /**
   * Compare-and-swap: the update only lands if the project is still in
   * `expectedStatus`, so two concurrent transitions cannot both apply.
   */
  async updateStatus(
    tenantId: string,
    id: string,
    expectedStatus: ProjectStatus,
    status: ProjectStatus,
    extra: Partial<
      Pick<ProjectInsert, 'quotedAmountEtb' | 'contractAmountEtb'>
    > = {},
  ): Promise<ProjectRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(projects)
        .set({
          status,
          statusChangedAt: now,
          updatedAt: now,
          ...(status === 'CONTRACT' ? { wonAt: now } : {}),
          ...extra,
        })
        .where(
          and(
            eq(projects.id, id),
            eq(projects.status, expectedStatus),
            isNull(projects.deletedAt),
          ),
        )
        .returning();
      if (!row) {
        const existingRow = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
          .limit(1);
        if (existingRow[0]) {
          throw new WorkflowTransitionError(
            'Project status changed concurrently — reload and retry',
          );
        }
        throw new NotFoundException('Project not found');
      }
      return row;
    });
  }
}
