import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import {
  customers,
  messageTemplates,
  tenants,
  users,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { UserRole } from '../../types/auth.types';

export type MessageTemplateRecord = typeof messageTemplates.$inferSelect;

/** One person a broadcast may reach: what the placeholders and the consent check need. */
export interface BroadcastRecipient {
  id: string;
  name: string;
  phone: string | null;
  smsConsentAt: Date | null;
  smsConsentRevokedAt: Date | null;
}

@Injectable()
export class MessagingRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  listTemplates(tenantId: string): Promise<MessageTemplateRecord[]> {
    return this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(messageTemplates)
        .where(isNull(messageTemplates.deletedAt))
        .orderBy(desc(messageTemplates.updatedAt)),
    );
  }

  async findTemplate(tenantId: string, id: string): Promise<MessageTemplateRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(messageTemplates)
        .where(and(eq(messageTemplates.id, id), isNull(messageTemplates.deletedAt)))
        .limit(1);
      if (!row) {
        throw new NotFoundException('Message template not found');
      }
      return row;
    });
  }

  async createTemplate(
    tenantId: string,
    createdByUserId: string,
    values: { name: string; body: string },
  ): Promise<MessageTemplateRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(messageTemplates)
        .values({ tenantId, ...values, createdByUserId })
        .returning();
      if (!row) {
        throw new Error('Failed to create message template');
      }
      return row;
    });
  }

  async updateTemplate(
    tenantId: string,
    id: string,
    patch: { name?: string; body?: string },
  ): Promise<MessageTemplateRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(messageTemplates)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(messageTemplates.id, id), isNull(messageTemplates.deletedAt)))
        .returning();
      if (!row) {
        throw new NotFoundException('Message template not found');
      }
      return row;
    });
  }

  /** Soft delete: a template someone already broadcast from stays readable in history. */
  async deleteTemplate(tenantId: string, id: string): Promise<void> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(messageTemplates)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(messageTemplates.id, id), isNull(messageTemplates.deletedAt)))
        .returning({ id: messageTemplates.id });
      if (!row) {
        throw new NotFoundException('Message template not found');
      }
    });
  }

  /** Active staff with a phone on file, optionally narrowed to roles. */
  listEmployeeRecipients(
    tenantId: string,
    roles: readonly UserRole[] | undefined,
  ): Promise<BroadcastRecipient[]> {
    return this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: users.id,
          name: users.fullName,
          phone: users.phone,
          smsConsentAt: users.smsConsentAt,
          smsConsentRevokedAt: users.smsConsentRevokedAt,
        })
        .from(users)
        .where(
          and(
            eq(users.isActive, true),
            isNull(users.deletedAt),
            isNotNull(users.phone),
            roles && roles.length > 0 ? inArray(users.role, [...roles]) : undefined,
          ),
        )
        .orderBy(users.fullName),
    );
  }

  /** Customers with a phone on file. */
  listCustomerRecipients(tenantId: string): Promise<BroadcastRecipient[]> {
    return this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          smsConsentAt: customers.smsConsentAt,
          smsConsentRevokedAt: customers.smsConsentRevokedAt,
        })
        .from(customers)
        .where(and(isNull(customers.deletedAt), isNotNull(customers.phone)))
        .orderBy(customers.name),
    );
  }

  async tenantName(tenantId: string): Promise<string> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return row?.name ?? '';
    });
  }
}
