import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import {
  assetChecklistItems,
  assetEvents,
  assets,
  customers,
  projects,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { ArrivalChecklistRow } from './arrival-checklist';
import type {
  AssetCategory,
  AssetChecklistMark,
  AssetStatus,
  CreateAssetDto,
  UpdateAssetDto,
} from './dto/asset.dto';

export type AssetRecord = typeof assets.$inferSelect;

export type AssetListRow = AssetRecord & {
  customerName: string | null;
  /** Parts unticked as not arrived. */
  shortParts: number;
};

export interface AssetFilters {
  search?: string;
  category?: AssetCategory;
  customerId?: string;
  status?: AssetStatus;
  /** True for lifts with a customer, false for lifts in stock. */
  sold?: boolean;
}

const assetFilterConditions = (options: AssetFilters): SQL[] => {
  const filters = [isNull(assets.deletedAt)];
  if (options.category) {
    filters.push(eq(assets.category, options.category));
  }
  if (options.customerId) {
    filters.push(eq(assets.customerId, options.customerId));
  }
  if (options.status) {
    filters.push(eq(assets.status, options.status));
  }
  if (options.sold !== undefined) {
    filters.push(
      options.sold ? isNotNull(assets.customerId) : isNull(assets.customerId),
    );
  }
  if (options.search && options.search.trim().length > 0) {
    const pattern = `%${options.search.trim().toLowerCase()}%`;
    filters.push(
      sql`(lower(${assets.name}) like ${pattern} or lower(coalesce(${assets.serialNumber}, '')) like ${pattern} or lower(coalesce(${assets.buildingName}, '')) like ${pattern})`,
    );
  }
  return filters;
};

/** `streamAll()`'s row shape: the raw `customerId` FK is replaced (not
 * appended) with the joined customer's display name — see REC 5. */
export type AssetExportRow = Omit<AssetRecord, 'customerId'> & {
  customerName: string | null;
};

@Injectable()
export class AssetsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: AssetFilters & { page?: string; pageSize?: string },
  ): Promise<PaginatedResult<AssetListRow>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const where = and(...assetFilterConditions(options));
      const [totalRow] = await tx
        .select({ value: count() })
        .from(assets)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select({
          ...getTableColumns(assets),
          customerName: customers.name,
          shortParts: sql<number>`(
            select count(*)::int from ${assetChecklistItems}
            where ${assetChecklistItems.tenantId} = ${assets.tenantId}
              and ${assetChecklistItems.assetId} = ${assets.id}
              and ${assetChecklistItems.mark} = 'MISSING'
          )`,
        })
        .from(assets)
        .leftJoin(
          customers,
          and(
            eq(assets.tenantId, customers.tenantId),
            eq(assets.customerId, customers.id),
          ),
        )
        .where(where)
        .orderBy(desc(assets.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * Streams every asset matching the same filters `list()` honors, for bulk
   * export, in batches of BATCH_SIZE.
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
    options: AssetFilters,
  ): AsyncGenerator<AssetExportRow> {
    const BATCH_SIZE = 500;
    let offset = 0;
    const { customerId: _customerId, ...assetColumns } =
      getTableColumns(assets);
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        return tx
          .select({ ...assetColumns, customerName: customers.name })
          .from(assets)
          .leftJoin(
            customers,
            and(
              eq(assets.tenantId, customers.tenantId),
              eq(assets.customerId, customers.id),
            ),
          )
          .where(and(...assetFilterConditions(options)))
          .orderBy(desc(assets.createdAt), asc(assets.id))
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

  async findById(tenantId: string, id: string): Promise<AssetRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(assets)
        .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async create(
    tenantId: string,
    createdByUserId: string,
    dto: CreateAssetDto,
    start: {
      status: AssetStatus;
      checklist: readonly (ArrivalChecklistRow & { mark: AssetChecklistMark })[];
    },
  ): Promise<AssetRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      if (dto.customerId) {
        const customerRows = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(eq(customers.id, dto.customerId), isNull(customers.deletedAt)),
          )
          .limit(1);
        if (!customerRows[0]) {
          throw new BadRequestException('Customer not found');
        }
      }
      if (dto.projectId) {
        const projectRows = await tx
          .select({ id: projects.id, customerId: projects.customerId })
          .from(projects)
          .where(
            and(eq(projects.id, dto.projectId), isNull(projects.deletedAt)),
          )
          .limit(1);
        const project = projectRows[0];
        if (!project) {
          throw new BadRequestException('Project not found');
        }
        if (project.customerId !== dto.customerId) {
          throw new BadRequestException(
            'Project does not belong to the selected customer',
          );
        }
      }
      const [row] = await tx
        .insert(assets)
        .values({
          tenantId,
          customerId: dto.customerId,
          projectId: dto.projectId,
          category: dto.category,
          name: dto.name,
          buildingName: dto.buildingName,
          serialNumber: dto.serialNumber,
          specSummary: dto.specSummary,
          locationNotes: dto.locationNotes,
          status: start.status,
          notes: dto.notes,
          createdByUserId,
        })
        .returning();
      if (!row) {
        throw new Error('Failed to create asset');
      }
      if (start.checklist.length > 0) {
        await tx.insert(assetChecklistItems).values(
          start.checklist.map((item, position) => ({
            ...item,
            tenantId,
            assetId: row.id,
            position,
            checkedByUserId: createdByUserId,
            checkedAt: row.createdAt,
          })),
        );
      }
      await tx.insert(assetEvents).values({
        tenantId,
        assetId: row.id,
        kind: 'REGISTERED',
        toStatus: start.status,
        customerId: dto.customerId,
        createdByUserId,
      });
      return row;
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAssetDto,
  ): Promise<AssetRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const existing = await tx
        .select()
        .from(assets)
        .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
        .limit(1);
      const current = existing[0];
      if (!current) {
        throw new NotFoundException('Asset not found');
      }
      const [row] = await tx
        .update(assets)
        .set({
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.buildingName !== undefined
            ? { buildingName: dto.buildingName }
            : {}),
          ...(dto.serialNumber !== undefined
            ? { serialNumber: dto.serialNumber }
            : {}),
          ...(dto.specSummary !== undefined
            ? { specSummary: dto.specSummary }
            : {}),
          ...(dto.locationNotes !== undefined
            ? { locationNotes: dto.locationNotes }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
        .returning();
      if (!row) {
        throw new NotFoundException('Asset not found');
      }
      return row;
    });
  }

  async softDelete(
    tenantId: string,
    id: string,
    deletedByUserId: string,
  ): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(assets)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
        .returning({ id: assets.id });
      if (!row) {
        throw new NotFoundException('Asset not found');
      }
      await tx.insert(assetEvents).values({
        tenantId,
        assetId: id,
        kind: 'DELETED',
        createdByUserId: deletedByUserId,
      });
    });
  }
}
