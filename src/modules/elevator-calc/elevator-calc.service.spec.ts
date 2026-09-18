import { ElevatorCalcService } from "./elevator-calc.service";
import {
  DEFAULT_PRODUCT_TYPES,
  type ProductTypesRepository,
} from "./product-types.repository";
import type { CalcInput, CalcRequest } from "./types";
import { DEFAULT_PRICING_FORMULA } from "../../common/formula";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";

/** The company's list, exactly as the repository would seed it. */
const productTypes = {
  findByCode: jest.fn(async (_tenantId: string, code: string) => {
    const row = DEFAULT_PRODUCT_TYPES.find((p) => p.code === code);
    return row ? { ...row, tenantId: TENANT_ID, id: code, sortOrder: 0 } : null;
  }),
  pricingSettings: jest.fn(async () => ({
    formula: DEFAULT_PRICING_FORMULA,
    priceListVatPercent: null,
  })),
} as unknown as ProductTypesRepository;

/** §4.1 technical fixture; pricing comes from the §4.2 product price list. */
const WORKED_EXAMPLE: CalcInput = {
  productType: "PASSENGER",
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: "MRL",
  doorType: "CENTER_OPEN",
  doorWidthMm: 900,
  buildingUsage: "COMMERCIAL",
  marginPercent: 25,
  taxPercent: 5,
};

describe("ElevatorCalcService", () => {
  const service = new ElevatorCalcService(productTypes);
  const calc = (input: CalcRequest) => service.calculateSpecs(TENANT_ID, input);

  describe("§4.2.3 worked example", () => {
    let result: Awaited<ReturnType<typeof calc>>;
    beforeAll(async () => {
      result = await calc(WORKED_EXAMPLE);
    });

    it("computes technical specs for the fixture", async () => {
      expect(result.technical.capacityPersons).toBe(13);
      expect(result.technical.carWidthMm).toBe(1100);
      expect(result.technical.carDepthMm).toBe(1400);
      expect(result.technical.carHeightMm).toBe(2300);
      expect(result.technical.shaftWidthMm).toBe(1400);
      expect(result.technical.shaftDepthMm).toBe(1700);
      expect(result.technical.machineRoomWidthMm).toBeNull();
      expect(result.technical.guideRailSpec).toBe("T89-1/B");
      expect(result.technical.counterweightMassKg).toBe("450.00");
    });

    it("prices off the product price list, not the retired TAD matrix", async () => {
      // 12 stops, 1000 kg PASSENGER:
      //   7,000,000 + (12-10)×80,000 + (1000-630)×1,000 = 7,530,000
      expect(result.pricing.basePrice).toBe("7000000.00");
      expect(result.pricing.stopsAdjustment).toBe("160000.00");
      expect(result.pricing.capacityAdjustment).toBe("370000.00");
      expect(result.pricing.totalBeforeMargin).toBe("7530000.00");
    });

    it("applies margin then tax on top of the list price", async () => {
      // 7,530,000 × 1.25 = 9,412,500 ; × 1.05 = 9,883,125
      expect(result.pricing.marginAmount).toBe("1882500.00");
      expect(result.pricing.subtotalWithMargin).toBe("9412500.00");
      expect(result.pricing.totalPrice).toBe("9883125.00");
    });
  });

  describe("price list", () => {
    it("applies the tenant's formula exactly — the starter does not floor at the reference machine", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 5,
        capacityKg: 450,
        marginPercent: 0,
        taxPercent: 0,
      });
      // 7,000,000 + (5-10)×80,000 + (450-630)×1,000
      expect(result.pricing.stopsAdjustment).toBe("-400000.00");
      expect(result.pricing.capacityAdjustment).toBe("-180000.00");
      expect(result.pricing.totalPrice).toBe("6420000.00");
    });

    it("floors at the reference machine when the formula says max(0, …)", async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: "base + max(0, N - 10) * perStop + max(0, C - 630) * perKg",
        priceListVatPercent: null,
      });
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 5,
        capacityKg: 450,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.stopsAdjustment).toBe("0.00");
      expect(result.pricing.capacityAdjustment).toBe("0.00");
      expect(result.pricing.totalPrice).toBe("7000000.00");
    });

    it("divides the VAT out of a VAT-inclusive price list so net + VAT is the sheet figure", async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: DEFAULT_PRICING_FORMULA,
        priceListVatPercent: "15.00",
      });
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 10,
        capacityKg: 630,
        marginPercent: 0,
        taxPercent: 15,
      });
      // The sheet says 7,000,000 for the base machine, VAT in.
      expect(result.pricing.basePrice).toBe("7000000.00");
      expect(result.pricing.listVatIncluded).toBe("913043.48");
      expect(result.pricing.totalBeforeMargin).toBe("6086956.52");
      expect(result.pricing.taxAmount).toBe("913043.48");
      expect(result.pricing.totalPrice).toBe("7000000.00");
      expect(result.formula.working).toMatch(
        /less 15.00% VAT included in the list = 6,086,956.52/,
      );
    });

    it("leaves an ex-VAT price list alone — no listVatIncluded row", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.listVatIncluded).toBeUndefined();
    });

    it("computes travel as 3.5 m × stops when a classic lift sends none", async () => {
      const { travelHeightM: _omitted, ...noTravel } = WORKED_EXAMPLE;
      const result = await calc({ ...noTravel, stops: 12 });
      expect(result.input.travelHeightM).toBe(42);
    });

    it("keeps an escalator's own rise — its price is the rise", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        productType: "ESCALATOR",
        stops: 2,
        travelHeightM: 10,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.input.travelHeightM).toBe(10);
      expect(result.pricing.totalPrice).toBe("8000000.00");
    });

    it("refuses a capacity below the product minimum (car lifts are sold from 3,500 kg)", async () => {
      await expect(
        calc({
          ...WORKED_EXAMPLE,
          productType: "CAR_LIFT",
          capacityKg: 3000,
          marginPercent: 0,
          taxPercent: 0,
        }),
      ).rejects.toThrow(/sold from 3,500 kg/);
    });

    it("splits a non-additive formula into what the stops added and what the capacity added", async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: "base + N * C * 10",
        priceListVatPercent: null,
      });
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 12,
        capacityKg: 1000,
        marginPercent: 0,
        taxPercent: 0,
      });
      // at C=630: 7,000,000 + 75,600; total: 7,000,000 + 120,000
      expect(result.pricing.stopsAdjustment).toBe("75600.00");
      expect(result.pricing.capacityAdjustment).toBe("44400.00");
      expect(result.pricing.totalPrice).toBe("7120000.00");
    });

    it("refuses to quote off a formula that cannot be evaluated", async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: "base + price",
        priceListVatPercent: null,
      });
      await expect(calc(WORKED_EXAMPLE)).rejects.toThrow(
        /pricing formula under Settings/,
      );
    });

    it("reads the base from the product list: one base per product, no height tiers", async () => {
      const totalAt = async (stops: number): Promise<string> =>
        (
          await calc({
            ...WORKED_EXAMPLE,
            stops,
            capacityKg: 630,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;

      // 7,000,000 + (20-10)×80,000 — the base no longer jumps at 20 stops
      expect(await totalAt(20)).toBe("7800000.00");
      // 7,000,000 + (31-10)×80,000
      expect(await totalAt(31)).toBe("8680000.00");
    });

    it("prices every product at its base when asked for its own base machine", async () => {
      const baseOf = async (productType: string): Promise<string> => {
        const row = DEFAULT_PRODUCT_TYPES.find((p) => p.code === productType)!;
        return (
          await calc({
            ...WORKED_EXAMPLE,
            productType,
            stops: row.refStops,
            capacityKg: row.refCapacityKg,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;
      };

      expect(await baseOf("HOSPITAL")).toBe("7000000.00");
      expect(await baseOf("PANORAMIC")).toBe("8000000.00");
      expect(await baseOf("HOME")).toBe("8000000.00");
      expect(await baseOf("CARGO")).toBe("8000000.00");
    });

    it("prices a car product at its smallest sellable machine, not the sheet base (sold from 3,500 kg)", async () => {
      const cheapest = async (productType: string): Promise<string> => {
        const row = DEFAULT_PRODUCT_TYPES.find((p) => p.code === productType)!;
        return (
          await calc({
            ...WORKED_EXAMPLE,
            productType,
            stops: row.refStops,
            capacityKg: row.minCapacityKg!,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;
      };
      // 11,000,000 + (3,500 − 3,000) × 500
      expect(await cheapest("CAR_LIFT")).toBe("11250000.00");
      // 5,200,000 + (3,500 − 3,000) × 400
      expect(await cheapest("CAR_PLATFORM_LIFT")).toBe("5400000.00");
      // 5,200,000 + (3,500 − 2,000) × 400
      expect(await cheapest("CAR_STACKING_LIFT")).toBe("5800000.00");
    });

    it("refuses a product that is not in the list", async () => {
      await expect(
        calc({ ...WORKED_EXAMPLE, productType: "SPACE_ELEVATOR" }),
      ).rejects.toThrow(/Unknown product type/);
    });

    it("prices every worked example on the company's price sheet (2026-09-14)", async () => {
      const sheet = async (
        productType: string,
        capacityKg: number,
        stops: number,
        travelHeightM = 30,
      ): Promise<string> =>
        (
          await calc({
            ...WORKED_EXAMPLE,
            productType,
            capacityKg,
            stops,
            travelHeightM,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;

      expect(await sheet("PASSENGER", 800, 15)).toBe("7570000.00");
      expect(await sheet("PANORAMIC", 800, 15)).toBe("8570000.00");
      expect(await sheet("CAR_LIFT", 5000, 3)).toBe("12300000.00");
      expect(await sheet("CAR_PLATFORM_LIFT", 5000, 3)).toBe("6250000.00");
      // L = 2 parking levels is the stop count
      expect(await sheet("CAR_STACKING_LIFT", 4000, 2)).toBe("6000000.00");
      expect(await sheet("CARGO", 2000, 5)).toBe("8850000.00");
      // Rise is the travel height; stops and capacity do not move an escalator
      expect(await sheet("ESCALATOR", 630, 10, 10)).toBe("8000000.00");
      expect(await sheet("ESCALATOR", 5000, 40, 10)).toBe("8000000.00");
    });

    it("uses the product's own formula over the company one, and splits the breakdown on it", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        productType: "ESCALATOR",
        travelHeightM: 10,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.basePrice).toBe("6000000.00");
      expect(result.pricing.stopsAdjustment).toBe("2000000.00");
      expect(result.pricing.capacityAdjustment).toBe("0.00");
    });

    it("does not vary price by speed, door, machine room or building usage", async () => {
      const plain = await calc({ ...WORKED_EXAMPLE });
      const loaded = await calc({
        ...WORKED_EXAMPLE,
        speedMs: 6,
        doorType: "TELESCOPIC",
        doorWidthMm: 1400,
        machineRoomType: "MR",
        buildingUsage: "HOSPITAL",
        travelHeightM: 200,
      });
      expect(loaded.pricing.totalPrice).toBe(plain.pricing.totalPrice);
    });
  });

  describe("boundary cases", () => {
    it("handles minimum capacity and MRL overhead reduction", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 320,
        stops: 2,
        travelHeightM: 3,
        speedMs: 0.4,
        machineRoomType: "MRL",
        buildingUsage: "RESIDENTIAL",
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.technical.capacityPersons).toBe(4);
      expect(result.technical.machineRoomWidthMm).toBeNull();
      expect(result.technical.overheadClearanceMm).toBe(
        4200 + 100 * 2 + 0 - 1500,
      );
    });

    it("applies high-speed and INDUSTRIAL counterweight adjustments", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 2500,
        speedMs: 2.5,
        buildingUsage: "INDUSTRIAL",
        machineRoomType: "MR",
      });
      // v=2.5 is not >2.5, so factor stays 0.45+0.05 = 0.50 → 1250 kg
      expect(result.technical.counterweightMassKg).toBe("1250.00");
      expect(result.technical.machineRoomWidthMm).not.toBeNull();
      expect(result.technical.guideRailSpec).toBe("T127-2/B");
    });

    it("drops to T140 rail when speed exceeds the T127 band", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 2500,
        speedMs: 3.0,
        machineRoomType: "MR",
      });
      expect(result.technical.guideRailSpec).toBe("T140-3/B");
    });
    it("raises HOSPITAL car height", async () => {
      const hospital = await calc({
        ...WORKED_EXAMPLE,
        buildingUsage: "HOSPITAL",
      });
      expect(hospital.technical.carHeightMm).toBe(2350);
    });

    // §4.1 is EN 81 *lift* geometry. A flat-priced escalator or platform lift
    // has no car, counterweight or guide rail, and the document renderers
    // drop absent keys — so emitting nulls here is what keeps a lift's
    // specification off an escalator quotation.
    it.each(["CAR_PLATFORM_LIFT", "ESCALATOR"] as const)(
      "emits no lift geometry for %s, only the product type",
      async (productType) => {
        const result = await calc({
          ...WORKED_EXAMPLE,
          productType,
          // A car platform is sold from 3,500 kg; the fixture's 1,000 kg is a passenger figure.
          capacityKg: 3500,
        });

        expect(result.technical.productType).toBe(productType);
        const { productType: _omitted, ...geometry } = result.technical;
        expect(Object.values(geometry).every((v) => v === null)).toBe(true);
        // Pricing is unaffected: flat, and still computed.
        expect(result.pricing.totalBeforeMargin).not.toBe("0.00");
      },
    );

    it("keeps the full lift geometry for PASSENGER", async () => {
      const result = await calc(WORKED_EXAMPLE);
      expect(result.technical.productType).toBe("PASSENGER");
      expect(result.technical.guideRailSpec).toBe("T89-1/B");
      expect(result.technical.carWidthMm).toBe(1100);
    });
  });

  describe("standard passenger lift (shaft + floors)", () => {
    const standard = (extra: Partial<CalcRequest>) =>
      service.calculateSpecs(TENANT_ID, {
        productType: "PASSENGER",
        shaftWidthMm: 1835,
        shaftDepthMm: 1750,
        floors: 8,
        marginPercent: 0,
        taxPercent: 0,
        ...extra,
      });

    it("reads the lift off the company's table from an exact shaft", async () => {
      const result = await standard({});
      expect(result.technical.capacityPersons).toBe(8);
      expect(result.input).toMatchObject({
        capacityKg: 630,
        stops: 8,
        travelHeightM: 28, // 8 floors × 3.5 m — the client's rule
        speedMs: 1.0,
        doorType: "CENTER_OPEN",
        doorWidthMm: 800,
        floors: 8,
      });
      expect(result.technical).toMatchObject({
        carWidthMm: 1100,
        carDepthMm: 1400,
        carHeightMm: 2400,
        shaftWidthMm: 1835,
        shaftDepthMm: 1750,
        pitDepthMm: null,
        motorPowerKw: null,
      });
      expect(result.notes).toEqual([]);
      // 7,000,000 + (8-10)×80,000 + 0
      expect(result.pricing.totalPrice).toBe("6840000.00");
    });

    it("takes the speed band from the floors", async () => {
      expect((await standard({ floors: 12 })).input.speedMs).toBe(1.5);
      expect((await standard({ floors: 18 })).input.speedMs).toBe(1.75);
      expect((await standard({ floors: 25 })).input.speedMs).toBe(2.0);
      expect((await standard({ floors: 30 })).input.speedMs).toBe(2.0);
    });

    it("caps the speed at the lift's maximum and says so", async () => {
      const result = await standard({
        shaftWidthMm: 1650,
        shaftDepthMm: 1450,
        floors: 30,
      });
      expect(result.technical.capacityPersons).toBe(5);
      expect(result.input.speedMs).toBe(1.75);
      expect(result.notes[0]).toMatch(/maximum is 1.75/);
    });

    it("picks the largest lift that fits a non-standard shaft and says so", async () => {
      const result = await standard({ shaftWidthMm: 2000, shaftDepthMm: 1800 });
      expect(result.technical.capacityPersons).toBe(10);
      expect(result.notes[0]).toMatch(/not a standard shaft/);
      // The spec sheet says the building's shaft, and names the row beside it.
      expect(result.technical.shaftWidthMm).toBe(2000);
      expect(result.technical.shaftDepthMm).toBe(1800);
      expect(result.technical.standardLift).toBe(
        "10-person lift, 1980 × 1750 mm standard shaft",
      );
    });

    it("tells the salesperson when nothing fits", async () => {
      await expect(
        standard({ shaftWidthMm: 1200, shaftDepthMm: 1200 }),
      ).rejects.toThrow(/No standard passenger lift fits/);
    });

    it("still wants every figure for a product outside the table", async () => {
      await expect(
        service.calculateSpecs(TENANT_ID, {
          productType: "CARGO",
          marginPercent: 0,
          taxPercent: 0,
        }),
      ).rejects.toThrow(/capacityKg/);
    });
  });
});
