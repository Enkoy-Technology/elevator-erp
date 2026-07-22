import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { notifications, users } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { CreateNotificationDto } from './dto/notification.dto';

export type NotificationRecord = typeof notifications.$inferSelect;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async listForUser(
    tenantId: string,
    userId: string,
    options: {
      unreadOnly?: boolean;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<NotificationRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [eq(notifications.userId, userId)];
      if (options.unreadOnly) {
        filters.push(isNull(notifications.readAt));
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(notifications)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  async unreadCount(tenantId: string, userId: string): Promise<number> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ value: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
          ),
        );
      return Number(row?.value ?? 0);
    });
  }

  async create(
    tenantId: string,
    createdByUserId: string,
    dto: CreateNotificationDto,
  ): Promise<NotificationRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const recipient = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, dto.userId),
            eq(users.isActive, true),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      if (!recipient[0]) {
        throw new BadRequestException('Recipient user not found');
      }
      const [row] = await tx
        .insert(notifications)
        .values({
          tenantId,
          userId: dto.userId,
          type: dto.type ?? 'GENERAL',
          title: dto.title,
          body: dto.body,
          linkPath: dto.linkPath,
          createdByUserId,
        })
        .returning();
      if (!row) {
        throw new Error('Failed to create notification');
      }
      return row;
    });
  }

  async markRead(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<NotificationRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.userId, userId),
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException('Notification not found');
      }
      return row;
    });
  }

  async markAllRead(tenantId: string, userId: string): Promise<number> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
          ),
        )
        .returning({ id: notifications.id });
      return rows.length;
    });
  }
}
