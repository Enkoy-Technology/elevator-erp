import { ElevatorCalcService } from './elevator-calc.service';
import {
  DEFAULT_PRODUCT_TYPES,
  type ProductTypesRepository,
} from './product-types.repository';
import type { CalcInput, CalcRequest } from './types';
import { DEFAULT_PRICING_FORMULA } from '../../common/formula';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

/** The company's list, exactly as the repository would seed it. */
const productTypes = {
  findByCode: jest.fn(async (_tenantId: string, code: string) => {
    const row = DEFAULT_PRODUCT_TYPES.find((p) => p.code === code);
    return row ? { ...row, tenantId: TENANT_ID, id: code, sortOrder: 0 } : null;
  }),
  pricingFormula: jest.fn(async () => DEFAULT_PRICING_FORMULA),
} as unknown as ProductTypesRepository;

/** §4.1 technical fixture; pricing comes from the §4.2 product price list. */
const WORKED_EXAMPLE: CalcInput = {
  productType: 'PASSENGER',
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  marginPercent: 25,
  taxPercent: 5,
};

describe('ElevatorCalcService', () => {
  const service = new ElevatorCalcService(productTypes);
  const calc = (input: CalcInput) => service.calculateSpecs(TENANT_ID, input);

  describe('§4.2.3 worked example', () => {
    let result: Awaited<ReturnType<typeof calc>>;
    beforeAll(async () => {
      result = await calc(WORKED_EXAMPLE);
    });

    it('computes technical specs for the fixture', async () => {
      expect(result.technical.capacityPersons).toBe(13);
      expect(result.technical.carWidthMm).toBe(1100);
      expect(result.technical.carDepthMm).toBe(1400);
      expect(result.technical.carHeightMm).toBe(2300);
      expect(result.technical.shaftWidthMm).toBe(1400);
      expect(result.technical.shaftDepthMm).toBe(1700);
      expect(result.technical.machineRoomWidthMm).toBeNull();
      expect(result.technical.guideRailSpec).toBe('T89-1/B');
      expect(result.technical.counterweightMassKg).toBe('450.00');
    });

    it('prices off the product price list, not the retired TAD matrix', async () => {
      // 12 stops, 1000 kg PASSENGER:
      //   7,000,000 + (12-10)×80,000 + (1000-630)×1,000 = 7,530,000
      expect(result.pricing.basePrice).toBe('7000000.00');
      expect(result.pricing.stopsAdjustment).toBe('160000.00');
      expect(result.pricing.capacityAdjustment).toBe('370000.00');
      expect(result.pricing.totalBeforeMargin).toBe('7530000.00');
    });

    it('applies margin then tax on top of the list price', async () => {
      // 7,530,000 × 1.25 = 9,412,500 ; × 1.05 = 9,883,125
      expect(result.pricing.marginAmount).toBe('1882500.00');
      expect(result.pricing.subtotalWithMargin).toBe('9412500.00');
      expect(result.pricing.totalPrice).toBe('9883125.00');
    });
  });

  describe('price list', () => {
    it("applies the tenant's formula exactly — the starter does not floor at the reference machine", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 5,
        capacityKg: 450,
        marginPercent: 0,
        taxPercent: 0,
      });
      // 7,000,000 + (5-10)×80,000 + (450-630)×1,000
      expect(result.pricing.stopsAdjustment).toBe('-400000.00');
      expect(result.pricing.capacityAdjustment).toBe('-180000.00');
      expect(result.pricing.totalPrice).toBe('6420000.00');
    });

    it('floors at the reference machine when the formula says max(0, …)', async () => {
      (productTypes.pricingFormula as jest.Mock).mockResolvedValueOnce(
        'base + max(0, N - 10) * perStop + max(0, C - 630) * perKg',
      );
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 5,
        capacityKg: 450,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.stopsAdjustment).toBe('0.00');
      expect(result.pricing.capacityAdjustment).toBe('0.00');
      expect(result.pricing.totalPrice).toBe('7000000.00');
    });

    it('splits a non-additive formula into what the stops added and what the capacity added', async () => {
      (productTypes.pricingFormula as jest.Mock).mockResolvedValueOnce(
        'base + N * C * 10',
      );
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 12,
        capacityKg: 1000,
        marginPercent: 0,
        taxPercent: 0,
      });
      // at C=630: 7,000,000 + 75,600; total: 7,000,000 + 120,000
      expect(result.pricing.stopsAdjustment).toBe('75600.00');
      expect(result.pricing.capacityAdjustment).toBe('44400.00');
      expect(result.pricing.totalPrice).toBe('7120000.00');
    });

    it('refuses to quote off a formula that cannot be evaluated', async () => {
      (productTypes.pricingFormula as jest.Mock).mockResolvedValueOnce(
        'base + price',
      );
      await expect(calc(WORKED_EXAMPLE)).rejects.toThrow(
        /pricing formula under Settings/,
      );
    });

    it('reads the base from the product list: one base per product, no height tiers', async () => {
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
      expect(await totalAt(20)).toBe('7800000.00');
      // 7,000,000 + (31-10)×80,000
      expect(await totalAt(31)).toBe('8680000.00');
    });

    it('prices every product in the company list from its own base', async () => {
      const baseOf = async (productType: string): Promise<string> =>
        (
          await calc({
            ...WORKED_EXAMPLE,
            productType,
            stops: 10,
            capacityKg: 630,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;

      expect(await baseOf('HOSPITAL')).toBe('7000000.00');
      expect(await baseOf('PANORAMIC')).toBe('8000000.00');
      expect(await baseOf('HOME')).toBe('8000000.00');
      expect(await baseOf('CARGO')).toBe('8000000.00');
      expect(await baseOf('CAR_LIFT')).toBe('12000000.00');
    });

    it('refuses a product that is not in the list', async () => {
      await expect(
        calc({ ...WORKED_EXAMPLE, productType: 'SPACE_ELEVATOR' }),
      ).rejects.toThrow(/Unknown product type/);
    });

    it('does not tier platform lifts or escalators by stops', async () => {
      const totalAt = async (
        productType: string,
        stops: number,
      ): Promise<string> =>
        (
          await calc({
            ...WORKED_EXAMPLE,
            productType,
            stops,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;

      expect(await totalAt('CAR_PLATFORM_LIFT', 40)).toBe('3200000.00');
      expect(await totalAt('ESCALATOR', 40)).toBe('6000000.00');
    });

    it('prices a car platform lift flat, ignoring stops and capacity', async () => {
      const platformLift: CalcInput = {
        ...WORKED_EXAMPLE,
        productType: 'CAR_PLATFORM_LIFT',
        marginPercent: 0,
        taxPercent: 0,
      };
      const small = await calc({
        ...platformLift,
        stops: 4,
        capacityKg: 630,
      });
      const big = await calc({
        ...platformLift,
        stops: 20,
        capacityKg: 5000,
      });
      expect(small.pricing.totalPrice).toBe('3200000.00');
      expect(big.pricing.totalPrice).toBe('3200000.00');
    });

    it('prices an escalator flat', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        productType: 'ESCALATOR',
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.totalPrice).toBe('6000000.00');
    });

    it('does not vary price by speed, door, machine room or building usage', async () => {
      const plain = await calc({ ...WORKED_EXAMPLE });
      const loaded = await calc({
        ...WORKED_EXAMPLE,
        speedMs: 6,
        doorType: 'TELESCOPIC',
        doorWidthMm: 1400,
        machineRoomType: 'MR',
        buildingUsage: 'HOSPITAL',
        travelHeightM: 200,
      });
      expect(loaded.pricing.totalPrice).toBe(plain.pricing.totalPrice);
    });
  });

  describe('boundary cases', () => {
    it('handles minimum capacity and MRL overhead reduction', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 320,
        stops: 2,
        travelHeightM: 3,
        speedMs: 0.4,
        machineRoomType: 'MRL',
        buildingUsage: 'RESIDENTIAL',
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.technical.capacityPersons).toBe(4);
      expect(result.technical.machineRoomWidthMm).toBeNull();
      expect(result.technical.overheadClearanceMm).toBe(
        4200 + 100 * 2 + 0 - 1500,
      );
    });

    it('applies high-speed and INDUSTRIAL counterweight adjustments', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 2500,
        speedMs: 2.5,
        buildingUsage: 'INDUSTRIAL',
        machineRoomType: 'MR',
      });
      // v=2.5 is not >2.5, so factor stays 0.45+0.05 = 0.50 → 1250 kg
      expect(result.technical.counterweightMassKg).toBe('1250.00');
      expect(result.technical.machineRoomWidthMm).not.toBeNull();
      expect(result.technical.guideRailSpec).toBe('T127-2/B');
    });

    it('drops to T140 rail when speed exceeds the T127 band', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 2500,
        speedMs: 3.0,
        machineRoomType: 'MR',
      });
      expect(result.technical.guideRailSpec).toBe('T140-3/B');
    });
    it('raises HOSPITAL car height', async () => {
      const hospital = await calc({
        ...WORKED_EXAMPLE,
        buildingUsage: 'HOSPITAL',
      });
      expect(hospital.technical.carHeightMm).toBe(2350);
    });

    // §4.1 is EN 81 *lift* geometry. A flat-priced escalator or platform lift
    // has no car, counterweight or guide rail, and the document renderers
    // drop absent keys — so emitting nulls here is what keeps a lift's
    // specification off an escalator quotation.
    it.each(['CAR_PLATFORM_LIFT', 'ESCALATOR'] as const)(
      'emits no lift geometry for %s, only the product type',
      async (productType) => {
        const result = await calc({
          ...WORKED_EXAMPLE,
          productType,
        });

        expect(result.technical.productType).toBe(productType);
        const { productType: _omitted, ...geometry } = result.technical;
        expect(Object.values(geometry).every((v) => v === null)).toBe(true);
        // Pricing is unaffected: flat, and still computed.
        expect(result.pricing.totalBeforeMargin).not.toBe('0.00');
      },
    );

    it('keeps the full lift geometry for PASSENGER', async () => {
      const result = await calc(WORKED_EXAMPLE);
      expect(result.technical.productType).toBe('PASSENGER');
      expect(result.technical.guideRailSpec).toBe('T89-1/B');
      expect(result.technical.carWidthMm).toBe(1100);
    });
  });

  describe('standard passenger lift (shaft + floors)', () => {
    const standard = (extra: Partial<CalcRequest>) =>
      service.calculateSpecs(TENANT_ID, {
        productType: 'PASSENGER',
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
        travelHeightM: 21,
        speedMs: 1.0,
        doorType: 'CENTER_OPEN',
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
      expect(result.pricing.totalPrice).toBe('6840000.00');
    });

    it('takes the speed band from the floors', async () => {
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

    it('picks the largest lift that fits a non-standard shaft and says so', async () => {
      const result = await standard({ shaftWidthMm: 2000, shaftDepthMm: 1800 });
      expect(result.technical.capacityPersons).toBe(10);
      expect(result.notes[0]).toMatch(/not a standard shaft/);
    });

    it('tells the salesperson when nothing fits', async () => {
      await expect(
        standard({ shaftWidthMm: 1200, shaftDepthMm: 1200 }),
      ).rejects.toThrow(/No standard passenger lift fits/);
    });

    it('still wants every figure for a product outside the table', async () => {
      await expect(
        service.calculateSpecs(TENANT_ID, {
          productType: 'CARGO',
          marginPercent: 0,
          taxPercent: 0,
        }),
      ).rejects.toThrow(/capacityKg/);
    });
  });
});
