import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { DEFAULT_PRICING_FORMULA } from "../../common/formula";
import { productTypes, tenants } from "../../database/schema";
import { TenantDbService } from "../../database/tenant-db.service";

export type ProductTypeRecord = typeof productTypes.$inferSelect;

/**
 * The company's price sheet (2026-09-14), in ETB. The first read on a tenant
 * with no products writes these, so the calculator never has nothing to
 * sell and the settings page never opens empty. Each product carries the
 * machine its base price includes (refStops, refCapacityKg) and what a
 * bigger one adds per stop and per kilogram; the escalator alone has its
 * own formula, on the rise. Hospital and home elevators are not on the
 * sheet and keep the passenger rates.
 */
export const DEFAULT_PRODUCT_TYPES: readonly {
  code: string;
  name: string;
  basePriceEtb: string;
  perStopEtb: string;
  perKgEtb: string;
  kgStep: number;
  refStops: number;
  refCapacityKg: number;
  minCapacityKg: number | null;
  formula: string | null;
  liftGeometry: boolean;
}[] = [
  // The sheet, line for line: base, per stop above the base machine, per
  // 100 kg (passenger class) or per 1,000 kg (car and goods) above the
  // base capacity. Hospital and home are not on the sheet and keep the
  // passenger and panoramic rates respectively.
  product(
    "PASSENGER",
    "Passenger elevator",
    "7000000.00",
    "80000.00",
    "100000.00",
    10,
    630,
    true,
    null,
    null,
    100,
  ),
  product(
    "HOSPITAL",
    "Hospital elevator",
    "7000000.00",
    "80000.00",
    "100000.00",
    10,
    630,
    true,
    null,
    null,
    100,
  ),
  product(
    "PANORAMIC",
    "Panoramic elevator",
    "8000000.00",
    "80000.00",
    "100000.00",
    10,
    630,
    true,
    null,
    null,
    100,
  ),
  product(
    "HOME",
    "Home elevator",
    "8000000.00",
    "80000.00",
    "100000.00",
    10,
    630,
    true,
    null,
    null,
    100,
  ),
  product(
    "CARGO",
    "Cargo / goods lift",
    "8000000.00",
    "150000.00",
    "400000.00",
    2,
    1000,
    true,
    null,
    null,
    1000,
  ),
  product(
    "CAR_LIFT",
    "Car lift",
    "11000000.00",
    "300000.00",
    "500000.00",
    2,
    3000,
    true,
    null,
    3500,
    1000,
  ),
  product(
    "CAR_PLATFORM_LIFT",
    "Car platform lift",
    "5200000.00",
    "250000.00",
    "400000.00",
    2,
    3000,
    false,
    null,
    3500,
    1000,
  ),
  // N is the number of parking levels (L on the sheet); the sheet writes
  // the capacity term first, so the product carries its own formula.
  product(
    "CAR_STACKING_LIFT",
    "Car stacking lift",
    "5200000.00",
    "500000.00",
    "400000.00",
    2,
    2000,
    false,
    "Base price + ((C − refC) / kgStep) × perKg + (L − refN) × perStop",
    3500,
    1000,
  ),
  product(
    "ESCALATOR",
    "Escalator",
    "6000000.00",
    "0.00",
    "0.00",
    10,
    630,
    false,
    "Base price + (Rise − 6) × 500,000",
  ),
];

function product(
  code: string,
  name: string,
  basePriceEtb: string,
  perStopEtb: string,
  perKgEtb: string,
  refStops: number,
  refCapacityKg: number,
  liftGeometry: boolean,
  formula: string | null = null,
  minCapacityKg: number | null = null,
  kgStep = 1,
) {
  return {
    code,
    name,
    basePriceEtb,
    perStopEtb,
    perKgEtb,
    kgStep,
    refStops,
    refCapacityKg,
    minCapacityKg,
    formula,
    liftGeometry,
  };
}

/** "Panoramic elevator" -> "PANORAMIC_ELEVATOR". */
export const codeFromName = (name: string): string =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

export interface ProductTypeInput {
  name: string;
  basePriceEtb: string;
  perStopEtb: string;
  perKgEtb: string;
  refStops: number;
  refCapacityKg: number;
  kgStep: number;
  minCapacityKg: number | null;
  formula: string | null;
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

  /**
   * The tenant's list-price formula (the starter when none is saved) and the
   * VAT rate baked into its price list (null: the list is ex-VAT).
   */
  pricingSettings(
    tenantId: string,
  ): Promise<{ formula: string; priceListVatPercent: string | null }> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          pricingFormula: tenants.pricingFormula,
          priceListVatPercent: tenants.priceListVatPercent,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return {
        formula: row?.pricingFormula ?? DEFAULT_PRICING_FORMULA,
        priceListVatPercent: row?.priceListVatPercent ?? null,
      };
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
        throw new ConflictException("The name must contain letters or digits");
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
        throw new Error("Failed to create product type");
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
        throw new NotFoundException("Product type not found");
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
        throw new NotFoundException("Product type not found");
      }
    });
  }
}
