import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, getTableColumns, isNull } from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import {
  assets,
  breakdowns,
  customers,
  maintenanceContracts,
  serviceVisits,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type {
  BreakdownStatus,
  CreateBreakdownDto,
  CreateMaintenanceContractDto,
  LogServiceVisitDto,
  MaintenanceContractStatus,
  UpdateBreakdownDto,
  UpdateMaintenanceContractDto,
} from './dto/maintenance.dto';
import { nextServiceDateAfter } from './recurrence';

export type MaintenanceContractRecord =
  typeof maintenanceContracts.$inferSelect;
export type ServiceVisitRecord = typeof serviceVisits.$inferSelect;
export type BreakdownRecord = typeof breakdowns.$inferSelect;

/** `streamAllContracts()`'s row shape: both FKs are replaced (not
 * appended) with their joined display names — see REC 5. Mirrors
 * BreakdownExportRow below: contracts have the same assetId+customerId FK
 * shape as breakdowns, so both get the same treatment. */
export type MaintenanceContractExportRow = Omit<
  MaintenanceContractRecord,
  'assetId' | 'customerId'
> & { assetName: string | null; customerName: string | null };

/** `streamAllBreakdowns()`'s row shape: both FKs are replaced (not
 * appended) with their joined display names — see REC 5. */
export type BreakdownExportRow = Omit<
  BreakdownRecord,
  'assetId' | 'customerId'
> & { assetName: string | null; customerName: string | null };

@Injectable()
export class MaintenanceRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async listContracts(
    tenantId: string,
    options: {
      page?: string;
      pageSize?: string;
      status?: MaintenanceContractStatus;
    },
  ): Promise<PaginatedResult<MaintenanceContractRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(maintenanceContracts.deletedAt)];
      if (options.status) {
        filters.push(eq(maintenanceContracts.status, options.status));
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(maintenanceContracts)
        .where(where);
      const items = await tx
        .select()
        .from(maintenanceContracts)
        .where(where)
        .orderBy(maintenanceContracts.nextServiceAt)
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(
        items,
        Number(totalRow?.value ?? 0),
        page,
        pageSize,
      );
    });
  }

  /**
   * Streams every contract matching the same filters `listContracts()`
   * honors, for bulk export, in batches of BATCH_SIZE.
   *
   * ponytail: offset batching, ties broken by the `id` tiebreaker below so
   * equal `nextServiceAt` values (e.g. a batch of monthly contracts all due
   * the same day) no longer duplicate or skip rows across batch boundaries
   * — concurrent inserts/deletes can still shift the offset window;
   * acceptable for ad-hoc admin downloads, switch to keyset cursor before
   * this feeds accounting reconciliation. Perf ceiling: keyset if
   * large-tenant exports time out.
   *
   * Tenant-scoping subtlety: `app.tenant_id` is a transaction-local GUC
   * (set by `withTenant`), so each batch opens its own `withTenant`
   * transaction rather than reusing one `tx` across the whole generator.
   */
  async *streamAllContracts(
    tenantId: string,
    options: { status?: MaintenanceContractStatus },
  ): AsyncGenerator<MaintenanceContractExportRow> {
    const BATCH_SIZE = 500;
    let offset = 0;
    const {
      assetId: _assetId,
      customerId: _customerId,
      ...contractColumns
    } = getTableColumns(maintenanceContracts);
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const filters = [isNull(maintenanceContracts.deletedAt)];
        if (options.status) {
          filters.push(eq(maintenanceContracts.status, options.status));
        }
        return tx
          .select({
            ...contractColumns,
            assetName: assets.name,
            customerName: customers.name,
          })
          .from(maintenanceContracts)
          .leftJoin(
            assets,
            and(
              eq(maintenanceContracts.tenantId, assets.tenantId),
              eq(maintenanceContracts.assetId, assets.id),
            ),
          )
          .leftJoin(
            customers,
            and(
              eq(maintenanceContracts.tenantId, customers.tenantId),
              eq(maintenanceContracts.customerId, customers.id),
            ),
          )
          .where(and(...filters))
          .orderBy(maintenanceContracts.nextServiceAt, asc(maintenanceContracts.id))
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

  async createContract(
    tenantId: string,
    createdByUserId: string,
    dto: CreateMaintenanceContractDto,
  ): Promise<MaintenanceContractRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const assetRows = await tx
        .select()
        .from(assets)
        .where(and(eq(assets.id, dto.assetId), isNull(assets.deletedAt)))
        .limit(1);
      const asset = assetRows[0];
      if (!asset) {
        throw new BadRequestException('Asset not found');
      }
      const [row] = await tx
        .insert(maintenanceContracts)
        .values({
          tenantId,
          assetId: asset.id,
          customerId: asset.customerId,
          recurrence: dto.recurrence ?? 'MONTHLY',
          startDate: dto.startDate,
          nextServiceAt: dto.nextServiceAt,
          assignedUserId: dto.assignedUserId,
          notes: dto.notes,
          createdByUserId,
        })
        .returning();
      if (!row) {
        throw new Error('Failed to create maintenance contract');
      }
      return row;
    });
  }

  async updateContract(
    tenantId: string,
    id: string,
    dto: UpdateMaintenanceContractDto,
  ): Promise<MaintenanceContractRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(maintenanceContracts)
        .set({
          ...(dto.recurrence !== undefined
            ? { recurrence: dto.recurrence }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.nextServiceAt !== undefined
            ? { nextServiceAt: dto.nextServiceAt }
            : {}),
          ...(dto.assignedUserId !== undefined
            ? { assignedUserId: dto.assignedUserId }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(maintenanceContracts.id, id),
            isNull(maintenanceContracts.deletedAt),
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException('Maintenance contract not found');
      }
      return row;
    });
  }

  async logVisit(
    tenantId: string,
    contractId: string,
    performedByUserId: string,
    dto: LogServiceVisitDto,
  ): Promise<{
    visit: ServiceVisitRecord;
    contract: MaintenanceContractRecord;
  }> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const existing = await tx
        .select()
        .from(maintenanceContracts)
        .where(
          and(
            eq(maintenanceContracts.id, contractId),
            isNull(maintenanceContracts.deletedAt),
          ),
        )
        .limit(1);
      const contract = existing[0];
      if (!contract) {
        throw new NotFoundException('Maintenance contract not found');
      }
      if (contract.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Only active contracts can log service visits',
        );
      }
      const visitedDay = todayIso();
      const nextServiceAt = nextServiceDateAfter(
        contract.nextServiceAt,
        visitedDay,
        contract.recurrence,
      );

      const [visit] = await tx
        .insert(serviceVisits)
        .values({
          tenantId,
          contractId,
          notes: dto.notes,
          performedByUserId,
          visitedAt: new Date(),
        })
        .returning();
      if (!visit) {
        throw new Error('Failed to log service visit');
      }

      const [updated] = await tx
        .update(maintenanceContracts)
        .set({
          lastServiceAt: visitedDay,
          nextServiceAt,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceContracts.id, contractId))
        .returning();
      if (!updated) {
        throw new Error('Failed to update contract after visit');
      }
      return { visit, contract: updated };
    });
  }

  async listVisits(
    tenantId: string,
    contractId: string,
    options: { page?: string; pageSize?: string } = {},
  ): Promise<PaginatedResult<ServiceVisitRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const contract = await tx
        .select({ id: maintenanceContracts.id })
        .from(maintenanceContracts)
        .where(
          and(
            eq(maintenanceContracts.id, contractId),
            isNull(maintenanceContracts.deletedAt),
          ),
        )
        .limit(1);
      if (!contract[0]) {
        throw new NotFoundException('Maintenance contract not found');
      }
      const where = eq(serviceVisits.contractId, contractId);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(serviceVisits)
        .where(where);
      const items = await tx
        .select()
        .from(serviceVisits)
        .where(where)
        .orderBy(desc(serviceVisits.visitedAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(
        items,
        Number(totalRow?.value ?? 0),
        page,
        pageSize,
      );
    });
  }

  async listBreakdowns(
    tenantId: string,
    options: { page?: string; pageSize?: string; status?: BreakdownStatus },
  ): Promise<PaginatedResult<BreakdownRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(breakdowns.deletedAt)];
      if (options.status) {
        filters.push(eq(breakdowns.status, options.status));
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(breakdowns)
        .where(where);
      const items = await tx
        .select()
        .from(breakdowns)
        .where(where)
        .orderBy(desc(breakdowns.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(
        items,
        Number(totalRow?.value ?? 0),
        page,
        pageSize,
      );
    });
  }

  /**
   * Streams every breakdown matching the same filters `listBreakdowns()`
   * honors, for bulk export, in batches of BATCH_SIZE.
   *
   * ponytail: offset batching, ties broken by the `id` tiebreaker below so
   * equal `createdAt` values (e.g. a bulk-logged incident batch) no longer
   * duplicate or skip rows across batch boundaries — concurrent
   * inserts/deletes can still shift the offset window; acceptable for
   * ad-hoc admin downloads, switch to keyset cursor before this feeds
   * accounting reconciliation. Perf ceiling: keyset if large-tenant exports
   * time out.
   *
   * Tenant-scoping subtlety: `app.tenant_id` is a transaction-local GUC
   * (set by `withTenant`), so each batch opens its own `withTenant`
   * transaction rather than reusing one `tx` across the whole generator.
   */
  async *streamAllBreakdowns(
    tenantId: string,
    options: { status?: BreakdownStatus },
  ): AsyncGenerator<BreakdownExportRow> {
    const BATCH_SIZE = 500;
    let offset = 0;
    const { assetId: _assetId, customerId: _customerId, ...breakdownColumns } =
      getTableColumns(breakdowns);
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const filters = [isNull(breakdowns.deletedAt)];
        if (options.status) {
          filters.push(eq(breakdowns.status, options.status));
        }
        return tx
          .select({
            ...breakdownColumns,
            assetName: assets.name,
            customerName: customers.name,
          })
          .from(breakdowns)
          .leftJoin(
            assets,
            and(
              eq(breakdowns.tenantId, assets.tenantId),
              eq(breakdowns.assetId, assets.id),
            ),
          )
          .leftJoin(
            customers,
            and(
              eq(breakdowns.tenantId, customers.tenantId),
              eq(breakdowns.customerId, customers.id),
            ),
          )
          .where(and(...filters))
          .orderBy(desc(breakdowns.createdAt), asc(breakdowns.id))
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

  async createBreakdown(
    tenantId: string,
    createdByUserId: string,
    dto: CreateBreakdownDto,
  ): Promise<BreakdownRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const assetRows = await tx
        .select()
        .from(assets)
        .where(and(eq(assets.id, dto.assetId), isNull(assets.deletedAt)))
        .limit(1);
      const asset = assetRows[0];
      if (!asset) {
        throw new BadRequestException('Asset not found');
      }
      const status = dto.assignedUserId ? 'ASSIGNED' : 'OPEN';
      const [row] = await tx
        .insert(breakdowns)
        .values({
          tenantId,
          assetId: asset.id,
          customerId: asset.customerId,
          title: dto.title,
          description: dto.description,
          severity: dto.severity ?? 'MEDIUM',
          status,
          assignedUserId: dto.assignedUserId,
          createdByUserId,
        })
        .returning();
      if (!row) {
        throw new Error('Failed to create breakdown');
      }
      return row;
    });
  }

  async updateBreakdown(
    tenantId: string,
    id: string,
    dto: UpdateBreakdownDto,
  ): Promise<BreakdownRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const existing = await tx
        .select()
        .from(breakdowns)
        .where(and(eq(breakdowns.id, id), isNull(breakdowns.deletedAt)))
        .limit(1);
      const current = existing[0];
      if (!current) {
        throw new NotFoundException('Breakdown not found');
      }

      let status = dto.status ?? current.status;
      if (dto.assignedUserId && status === 'OPEN') {
        status = 'ASSIGNED';
      }
      if (dto.assignedUserId === null && status === 'ASSIGNED') {
        status = 'OPEN';
      }

      const resolvedAt =
        status === 'DONE' ? (current.resolvedAt ?? new Date()) : null;

      const [row] = await tx
        .update(breakdowns)
        .set({
          ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.assignedUserId !== undefined
            ? { assignedUserId: dto.assignedUserId }
            : {}),
          status,
          resolvedAt,
          updatedAt: new Date(),
        })
        .where(and(eq(breakdowns.id, id), isNull(breakdowns.deletedAt)))
        .returning();
      if (!row) {
        throw new NotFoundException('Breakdown not found');
      }
      return row;
    });
  }
}
