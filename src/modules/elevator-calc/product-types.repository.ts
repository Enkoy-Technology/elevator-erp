import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { DEFAULT_PRICING_FORMULA } from '../../common/formula';
import { productTypes, tenants } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export type ProductTypeRecord = typeof productTypes.$inferSelect;

/**
 * The company's own list (2026-09-09), in ETB. The first read on a tenant
 * with no products writes these, so the calculator never has nothing to
 * sell and the settings page never opens empty. Elevators carry the
 * per-stop and per-kilogram rates the price list has always used; the
 * platform lift and the escalator are flat.
 */
export const DEFAULT_PRODUCT_TYPES: readonly {
  code: string;
  name: string;
  basePriceEtb: string;
  perStopEtb: string;
  perKgEtb: string;
  liftGeometry: boolean;
}[] = [
  {
    code: 'PASSENGER',
    name: 'Passenger elevator',
    basePriceEtb: '7000000.00',
    perStopEtb: '80000.00',
    perKgEtb: '1000.00',
    liftGeometry: true,
  },
  {
    code: 'HOSPITAL',
    name: 'Hospital elevator',
    basePriceEtb: '7000000.00',
    perStopEtb: '80000.00',
    perKgEtb: '1000.00',
    liftGeometry: true,
  },
  {
    code: 'PANORAMIC',
    name: 'Panoramic elevator',
    basePriceEtb: '8000000.00',
    perStopEtb: '80000.00',
    perKgEtb: '1000.00',
    liftGeometry: true,
  },
  {
    code: 'HOME',
    name: 'Home elevator',
    basePriceEtb: '8000000.00',
    perStopEtb: '80000.00',
    perKgEtb: '1000.00',
    liftGeometry: true,
  },
  {
    code: 'CARGO',
    name: 'Cargo elevator',
    basePriceEtb: '8000000.00',
    perStopEtb: '80000.00',
    perKgEtb: '1000.00',
    liftGeometry: true,
  },
  {
    code: 'CAR_LIFT',
    name: 'Car lift',
    basePriceEtb: '12000000.00',
    perStopEtb: '80000.00',
    perKgEtb: '1000.00',
    liftGeometry: true,
  },
  {
    code: 'CAR_PLATFORM_LIFT',
    name: 'Car platform lift',
    basePriceEtb: '3200000.00',
    perStopEtb: '0.00',
    perKgEtb: '0.00',
    liftGeometry: false,
  },
  {
    code: 'ESCALATOR',
    name: 'Escalator',
    basePriceEtb: '6000000.00',
    perStopEtb: '0.00',
    perKgEtb: '0.00',
    liftGeometry: false,
  },
];

/** "Panoramic elevator" -> "PANORAMIC_ELEVATOR". */
export const codeFromName = (name: string): string =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

export interface ProductTypeInput {
  name: string;
  basePriceEtb: string;
  perStopEtb: string;
  perKgEtb: string;
  liftGeometry: boolean;
}

@Injectable()
export class ProductTypesRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /** Active products in display order. Seeds the defaults on a tenant that has none. */
  list(tenantId: string): Promise<ProductTypeRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(productTypes)
        .where(isNull(productTypes.deletedAt))
        .orderBy(asc(productTypes.sortOrder), asc(productTypes.name));
      if (rows.length > 0) {
        return rows;
      }
      // Nothing yet, not even a deleted one: first use. Write the company's list.
      const [any] = await tx
        .select({ id: productTypes.id })
        .from(productTypes)
        .limit(1);
      if (any) {
        return rows;
      }
      return tx
        .insert(productTypes)
        .values(
          DEFAULT_PRODUCT_TYPES.map((p, i) => ({
            tenantId,
            ...p,
            sortOrder: i,
          })),
        )
        .onConflictDoNothing()
        .returning();
    });
  }

  /** The tenant's list-price formula, or the starter when none is saved. */
  pricingFormula(tenantId: string): Promise<string> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ pricingFormula: tenants.pricingFormula })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return row?.pricingFormula ?? DEFAULT_PRICING_FORMULA;
    });
  }

  async findByCode(
    tenantId: string,
    code: string,
  ): Promise<ProductTypeRecord | null> {
    const rows = await this.list(tenantId);
    return rows.find((row) => row.code === code) ?? null;
  }

  async create(
    tenantId: string,
    input: ProductTypeInput,
  ): Promise<ProductTypeRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const code = codeFromName(input.name);
      if (!code) {
        throw new ConflictException('The name must contain letters or digits');
      }
      const [clash] = await tx
        .select({ id: productTypes.id, deletedAt: productTypes.deletedAt })
        .from(productTypes)
        .where(eq(productTypes.code, code))
        .limit(1);
      if (clash && clash.deletedAt === null) {
        throw new ConflictException(
          `A product with the code ${code} already exists`,
        );
      }
      if (clash) {
        // Bring a deleted product back under the same code rather than
        // failing the unique constraint; old quotation lines still point at it.
        const [row] = await tx
          .update(productTypes)
          .set({ ...input, deletedAt: null, updatedAt: new Date() })
          .where(eq(productTypes.id, clash.id))
          .returning();
        return row!;
      }
      const [max] = await tx
        .select({ sortOrder: productTypes.sortOrder })
        .from(productTypes)
        .orderBy(desc(productTypes.sortOrder))
        .limit(1);
      const [row] = await tx
        .insert(productTypes)
        .values({
          tenantId,
          code,
          ...input,
          sortOrder: (max?.sortOrder ?? -1) + 1,
        })
        .returning();
      if (!row) {
        throw new Error('Failed to create product type');
      }
      return row;
    });
  }

  async update(
    tenantId: string,
    id: string,
    patch: Partial<ProductTypeInput>,
  ): Promise<ProductTypeRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const set = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      const [row] = await tx
        .update(productTypes)
        .set({ ...set, updatedAt: new Date() })
        .where(and(eq(productTypes.id, id), isNull(productTypes.deletedAt)))
        .returning();
      if (!row) {
        throw new NotFoundException('Product type not found');
      }
      return row;
    });
  }

  /** Soft delete: quotation lines that carry the code keep printing their name. */
  async remove(tenantId: string, id: string): Promise<void> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(productTypes)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(productTypes.id, id), isNull(productTypes.deletedAt)))
        .returning({ id: productTypes.id });
      if (!row) {
        throw new NotFoundException('Product type not found');
      }
    });
  }
}
