import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { assets, customers, projects } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type {
  AssetCategory,
  CreateAssetDto,
  UpdateAssetDto,
} from './dto/asset.dto';

export type AssetRecord = typeof assets.$inferSelect;

@Injectable()
export class AssetsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      search?: string;
      category?: AssetCategory;
      customerId?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<AssetRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(assets.deletedAt)];
      if (options.category) {
        filters.push(eq(assets.category, options.category));
      }
      if (options.customerId) {
        filters.push(eq(assets.customerId, options.customerId));
      }
      if (options.search && options.search.trim().length > 0) {
        const pattern = `%${options.search.trim().toLowerCase()}%`;
        filters.push(
          sql`(lower(${assets.name}) like ${pattern} or lower(coalesce(${assets.serialNumber}, '')) like ${pattern} or lower(coalesce(${assets.buildingName}, '')) like ${pattern})`,
        );
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(assets)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(assets)
        .where(where)
        .orderBy(desc(assets.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
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
  ): Promise<AssetRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
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
          locationNotes: dto.locationNotes,
          notes: dto.notes,
          createdByUserId,
        })
        .returning();
      if (!row) {
        throw new Error('Failed to create asset');
      }
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
        if (project.customerId !== current.customerId) {
          throw new BadRequestException(
            'Project does not belong to this asset\'s customer',
          );
        }
      }
      const [row] = await tx
        .update(assets)
        .set({
          ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.buildingName !== undefined
            ? { buildingName: dto.buildingName }
            : {}),
          ...(dto.serialNumber !== undefined
            ? { serialNumber: dto.serialNumber }
            : {}),
          ...(dto.locationNotes !== undefined
            ? { locationNotes: dto.locationNotes }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
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

  async softDelete(tenantId: string, id: string): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(assets)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
        .returning({ id: assets.id });
      if (!row) {
        throw new NotFoundException('Asset not found');
      }
    });
  }
}
