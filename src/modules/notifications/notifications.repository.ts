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
import type { CreateNotificationDto, NotificationType } from './dto/notification.dto';

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

  /**
   * `createdByUserId` is null for system-generated notifications (task-2
   * brief §2.4 — the reminders cron/breakdown-assignment path has no human
   * actor to attribute the notification to). The column is nullable for
   * exactly this reason; a real controller-driven send still passes the
   * acting user's id.
   */
  async create(
    tenantId: string,
    createdByUserId: string | null,
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

  /**
   * System-generated notifications (task-2 brief §2.4) have no dedupeKey
   * column to lean on the way `outbound_messages` does — this table predates
   * that idea. Callers that need "don't re-notify the same fact" (the daily
   * maintenance-reminder cron runs once per day for every day a contract
   * sits inside the reminder window, so without this a technician would get
   * a fresh notification each of those days) encode their own dedupe
   * identity into `linkPath` (e.g. `/maintenance?contract=<id>`) and check
   * here before creating.
   *
   * ponytail: check-then-insert, not a DB constraint — two API instances
   * running the same cron tick at once could both pass this check before
   * either inserts, producing one duplicate. Acceptable for a single-instance
   * deployment (today's reality); if multi-instance ever lands, either add a
   * real uniqueness constraint or take the same per-tenant advisory lock
   * EmployeesRepository.update already uses for its own write-skew guard.
   */
  async existsByLinkPath(
    tenantId: string,
    userId: string,
    type: NotificationType,
    linkPath: string,
  ): Promise<boolean> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.type, type),
            eq(notifications.linkPath, linkPath),
          ),
        )
        .limit(1);
      return rows.length > 0;
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
