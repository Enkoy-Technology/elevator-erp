import { Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { siteSurveys, users } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type {
  CreateSiteSurveyDto,
  SiteSurveyPatch,
} from './dto/site-survey.dto';

export type SiteSurveyRecord = typeof siteSurveys.$inferSelect;

/**
 * Who hears about a new sheet. The CEO and admins are not pinged: they see
 * every survey in the list through SUPER_ROLES, and this replaces a message
 * that only ever went to the manager.
 */
const NOTIFY_ROLES = ['GENERAL_MANAGER', 'SALES_MANAGER'] as const;

/** Every column of the sheet plus who collected it, by name. */
export type SiteSurveyListItem = SiteSurveyRecord & {
  surveyedByName: string | null;
};

@Injectable()
export class SiteSurveysRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Active users in the roles that get told a sheet came in. One query, run
   * once per submission — a handful of rows.
   */
  async listManagerIds(tenantId: string): Promise<string[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            inArray(users.role, [...NOTIFY_ROLES]),
            eq(users.isActive, true),
            isNull(users.deletedAt),
          ),
        );
      return rows.map((row) => row.id);
    });
  }

  async list(
    tenantId: string,
    options: {
      /** Set for a salesperson: they see only the sheets they submitted. */
      surveyedByUserId?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<SiteSurveyListItem>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters: SQL[] = [];
      if (options.surveyedByUserId) {
        filters.push(
          eq(siteSurveys.surveyedByUserId, options.surveyedByUserId),
        );
      }
      const search = options.search?.trim().toLowerCase();
      if (search) {
        const pattern = `%${search}%`;
        filters.push(
          sql`(lower(${siteSurveys.projectName}) like ${pattern} or lower(coalesce(${siteSurveys.address}, '')) like ${pattern} or lower(coalesce(${siteSurveys.contactName}, '')) like ${pattern} or lower(coalesce(${siteSurveys.contactPhone}, '')) like ${pattern} or lower(coalesce(${siteSurveys.floors}, '')) like ${pattern} or lower(coalesce(${siteSurveys.machineRoom}, '')) like ${pattern})`,
        );
      }
      const where = filters.length > 0 ? and(...filters) : undefined;
      const [totalRow] = await tx
        .select({ value: count() })
        .from(siteSurveys)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select({
          ...getTableColumns(siteSurveys),
          surveyedByName: users.fullName,
        })
        .from(siteSurveys)
        .leftJoin(
          users,
          and(
            eq(siteSurveys.tenantId, users.tenantId),
            eq(siteSurveys.surveyedByUserId, users.id),
          ),
        )
        .where(where)
        // id tiebreaker so two sheets submitted in the same instant cannot
        // be duplicated or skipped across pages.
        .orderBy(desc(siteSurveys.createdAt), asc(siteSurveys.id))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * One sheet plus who collected it. `surveyedByUserId` scopes the lookup the
   * same way `list()` does, so a salesperson asking for someone else's sheet
   * gets nothing back — the caller turns that into a 404, which is the point:
   * a 403 would confirm the row exists.
   */
  async findById(
    tenantId: string,
    id: string,
    surveyedByUserId?: string,
  ): Promise<SiteSurveyListItem | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          ...getTableColumns(siteSurveys),
          surveyedByName: users.fullName,
        })
        .from(siteSurveys)
        .leftJoin(
          users,
          and(
            eq(siteSurveys.tenantId, users.tenantId),
            eq(siteSurveys.surveyedByUserId, users.id),
          ),
        )
        .where(scopedWhere(id, surveyedByUserId))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: SiteSurveyPatch,
    surveyedByUserId?: string,
  ): Promise<SiteSurveyRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(siteSurveys)
        .set({ ...toUpdate(dto), updatedAt: new Date() })
        .where(scopedWhere(id, surveyedByUserId))
        .returning();
      if (!row) {
        throw new NotFoundException('Site survey not found');
      }
      return row;
    });
  }

  /** Hard delete: the table has no deletedAt and nothing references a sheet. */
  async delete(
    tenantId: string,
    id: string,
    surveyedByUserId?: string,
  ): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .delete(siteSurveys)
        .where(scopedWhere(id, surveyedByUserId))
        .returning({ id: siteSurveys.id });
      if (!row) {
        throw new NotFoundException('Site survey not found');
      }
    });
  }

  /**
   * The rows of one uploaded sheet, in one transaction: a half-imported file
   * would leave the salesperson guessing which rows to retype, so it all lands
   * or none of it does. Returns how many rows were written.
   */
  async createMany(
    tenantId: string,
    surveyedByUserId: string,
    dtos: readonly CreateSiteSurveyDto[],
  ): Promise<number> {
    if (dtos.length === 0) {
      return 0;
    }
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .insert(siteSurveys)
        .values(dtos.map((dto) => toInsert(tenantId, surveyedByUserId, dto)))
        .returning({ id: siteSurveys.id });
      return rows.length;
    });
  }

  async create(
    tenantId: string,
    surveyedByUserId: string,
    dto: CreateSiteSurveyDto,
  ): Promise<SiteSurveyRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(siteSurveys)
        .values(toInsert(tenantId, surveyedByUserId, dto))
        .returning();
      if (!row) {
        throw new Error('Failed to create site survey');
      }
      return row;
    });
  }
}

/** One sheet, column for column. Undated sheets are dated today. */
const toInsert = (
  tenantId: string,
  surveyedByUserId: string,
  dto: CreateSiteSurveyDto,
): typeof siteSurveys.$inferInsert => ({
  tenantId,
  surveyedByUserId,
  surveyDate: dto.surveyDate ?? todayIso(),
  projectName: dto.projectName,
  address: dto.address,
  contactName: dto.contactName,
  contactPhone: dto.contactPhone,
  shaftWidthCm: dto.shaftWidthCm,
  shaftDepthCm: dto.shaftDepthCm,
  floors: dto.floors,
  overheadCm: dto.overheadCm,
  machineRoom: dto.machineRoom,
  units: dto.units,
});

const scopedWhere = (id: string, surveyedByUserId?: string) =>
  surveyedByUserId
    ? and(
        eq(siteSurveys.id, id),
        eq(siteSurveys.surveyedByUserId, surveyedByUserId),
      )
    : eq(siteSurveys.id, id);

/**
 * Only the keys the caller actually sent: undefined leaves a column alone,
 * null clears it. projectName and surveyDate are NOT NULL, so a null there is
 * dropped rather than passed to the database.
 */
const toUpdate = (
  dto: SiteSurveyPatch,
): Partial<typeof siteSurveys.$inferInsert> => {
  const set: Partial<typeof siteSurveys.$inferInsert> = {};
  for (const [key, value] of Object.entries(dto)) {
    if (value === undefined) {
      continue;
    }
    if (value === null && (key === 'projectName' || key === 'surveyDate')) {
      continue;
    }
    Object.assign(set, { [key]: value });
  }
  return set;
};
