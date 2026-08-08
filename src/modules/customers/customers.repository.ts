import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, isNull, or, sql } from 'drizzle-orm';

import { CustomerInUseError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import {
  assets,
  customers,
  maintenanceContracts,
  projects,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

export type CustomerRecord = typeof customers.$inferSelect;

export interface SimilarCustomer {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
}

/** Enough digits to be a real phone rather than an area code. */
const MIN_PHONE_DIGITS = 7;

@Injectable()
export class CustomersRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: { search?: string; page?: string; pageSize?: string },
  ): Promise<PaginatedResult<CustomerRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(customers.deletedAt)];
      if (options.search && options.search.trim().length > 0) {
        const pattern = `%${options.search.trim().toLowerCase()}%`;
        filters.push(
          sql`(lower(${customers.name}) like ${pattern} or lower(coalesce(${customers.email}, '')) like ${pattern} or coalesce(${customers.phone}, '') like ${pattern})`,
        );
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(customers)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(customers)
        .where(where)
        .orderBy(desc(customers.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * Look-alike check for the create form. Warns, never blocks: name contains
   * in either direction (so "Addis Heights" matches "Addis Heights PLC" and
   * vice versa), or the same trailing 9 phone digits on either phone column
   * (so +251911000000, 0911000000 and 911000000 all match).
   */
  async findSimilar(
    tenantId: string,
    name: string,
    phone?: string,
  ): Promise<SimilarCustomer[]> {
    const needle = name.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const digits = (phone ?? '').replace(/\D/g, '').slice(-9);

    const signals = [
      sql`(lower(${customers.name}) like ${`%${needle}%`} or ${needle} like '%' || lower(${customers.name}) || '%')`,
    ];
    if (digits.length >= MIN_PHONE_DIGITS) {
      signals.push(
        sql`${digits} in (
          right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 9),
          right(regexp_replace(coalesce(${customers.alternatePhone}, ''), '\\D', '', 'g'), 9)
        )`,
      );
    }

    return this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          city: customers.city,
        })
        .from(customers)
        .where(and(isNull(customers.deletedAt), or(...signals)))
        .orderBy(desc(customers.createdAt))
        .limit(5),
    );
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
      // Same tenant transaction as the delete itself, so the dependent
      // counts and the delete are consistent — no window where a project
      // gets attached between the check and the write.
      const [projectRow] = await tx
        .select({ value: count() })
        .from(projects)
        .where(and(eq(projects.customerId, id), isNull(projects.deletedAt)));
      const [assetRow] = await tx
        .select({ value: count() })
        .from(assets)
        .where(and(eq(assets.customerId, id), isNull(assets.deletedAt)));
      const [contractRow] = await tx
        .select({ value: count() })
        .from(maintenanceContracts)
        .where(
          and(
            eq(maintenanceContracts.customerId, id),
            isNull(maintenanceContracts.deletedAt),
          ),
        );
      const projectCount = Number(projectRow?.value ?? 0);
      const assetCount = Number(assetRow?.value ?? 0);
      const contractCount = Number(contractRow?.value ?? 0);
      if (projectCount + assetCount + contractCount > 0) {
        throw new CustomerInUseError(projectCount, assetCount, contractCount);
      }

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
