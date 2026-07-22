import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { customers } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

export type CustomerRecord = typeof customers.$inferSelect;

@Injectable()
export class CustomersRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(tenantId: string, search?: string): Promise<CustomerRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(customers.deletedAt)];
      if (search && search.trim().length > 0) {
        const pattern = `%${search.trim().toLowerCase()}%`;
        filters.push(
          sql`(lower(${customers.name}) like ${pattern} or lower(coalesce(${customers.email}, '')) like ${pattern} or coalesce(${customers.phone}, '') like ${pattern})`,
        );
      }
      return tx
        .select()
        .from(customers)
        .where(and(...filters))
        .orderBy(desc(customers.createdAt))
        .limit(100);
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<CustomerRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(customers)
        .where(
          and(eq(customers.id, id), isNull(customers.deletedAt)),
        )
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async create(
    tenantId: string,
    createdByUserId: string,
    dto: CreateCustomerDto,
  ): Promise<CustomerRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(customers)
        .values({
          tenantId,
          name: dto.name,
          legalName: dto.legalName,
          email: dto.email?.toLowerCase(),
          phone: dto.phone,
          alternatePhone: dto.alternatePhone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          region: dto.region,
          country: dto.country ?? 'ET',
          buildingName: dto.buildingName,
          customerType: dto.customerType ?? 'COMMERCIAL',
          tags: dto.tags,
          notes: dto.notes,
          createdByUserId,
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert customer');
      }
      return row;
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(customers)
        .set({
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
          ...(dto.email !== undefined
            ? { email: dto.email?.toLowerCase() }
            : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.alternatePhone !== undefined
            ? { alternatePhone: dto.alternatePhone }
            : {}),
          ...(dto.addressLine1 !== undefined
            ? { addressLine1: dto.addressLine1 }
            : {}),
          ...(dto.addressLine2 !== undefined
            ? { addressLine2: dto.addressLine2 }
            : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.region !== undefined ? { region: dto.region } : {}),
          ...(dto.country !== undefined ? { country: dto.country } : {}),
          ...(dto.buildingName !== undefined
            ? { buildingName: dto.buildingName }
            : {}),
          ...(dto.customerType !== undefined
            ? { customerType: dto.customerType }
            : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
        .returning();
      if (!row) {
        throw new NotFoundException('Customer not found');
      }
      return row;
    });
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(customers)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
        .returning({ id: customers.id });
      if (!row) {
        throw new NotFoundException('Customer not found');
      }
    });
  }
}
