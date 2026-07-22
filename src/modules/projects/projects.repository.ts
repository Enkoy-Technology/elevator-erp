import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { projects, type ProjectStatus } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { CreateProjectDto } from './dto/create-project.dto';

export type ProjectRecord = typeof projects.$inferSelect;
export type ProjectInsert = typeof projects.$inferInsert;

@Injectable()
export class ProjectsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      status?: ProjectStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ProjectRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(projects.deletedAt)];
      if (options.status) {
        filters.push(eq(projects.status, options.status));
      }
      const where = and(...filters);
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
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<ProjectRecord | null> {
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
          code: dto.code,
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

  async updateStatus(
    tenantId: string,
    id: string,
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
          ...extra,
        })
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .returning();
      if (!row) {
        throw new NotFoundException('Project not found');
      }
      return row;
    });
  }
}
