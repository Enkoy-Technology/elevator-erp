import { ElevatorCalcService } from './elevator-calc.service';
import {
  DEFAULT_PRODUCT_TYPES,
  type ProductTypesRepository,
} from './product-types.repository';
import type { CalcInput } from './types';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

/** The company's list, exactly as the repository would seed it. */
const productTypes = {
  findByCode: jest.fn(async (_tenantId: string, code: string) => {
    const row = DEFAULT_PRODUCT_TYPES.find((p) => p.code === code);
    return row ? { ...row, tenantId: TENANT_ID, id: code, sortOrder: 0 } : null;
  }),
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
    it('floors both adjustments at the reference machine (10 stops, 630 kg)', async () => {
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

    it('reads the base from the product list: one base per product, no height tiers', async () => {
      const totalAt = async (stops: number): Promise<string> =>
        (await calc({ ...WORKED_EXAMPLE, stops, capacityKg: 630, marginPercent: 0, taxPercent: 0 }))
          .pricing.totalPrice;

      // 7,000,000 + (20-10)×80,000 — the base no longer jumps at 20 stops
      expect(await totalAt(20)).toBe('7800000.00');
      // 7,000,000 + (31-10)×80,000
      expect(await totalAt(31)).toBe('8680000.00');
    });

    it('prices every product in the company list from its own base', async () => {
      const baseOf = async (productType: string): Promise<string> =>
        (await calc({ ...WORKED_EXAMPLE, productType, stops: 10, capacityKg: 630, marginPercent: 0, taxPercent: 0 }))
          .pricing.totalPrice;

      expect(await baseOf('HOSPITAL')).toBe('7000000.00');
      expect(await baseOf('PANORAMIC')).toBe('8000000.00');
      expect(await baseOf('HOME')).toBe('8000000.00');
      expect(await baseOf('CARGO')).toBe('8000000.00');
      expect(await baseOf('CAR_LIFT')).toBe('12000000.00');
    });

    it('refuses a product that is not in the list', async () => {
      await expect(calc({ ...WORKED_EXAMPLE, productType: 'SPACE_ELEVATOR' })).rejects.toThrow(
        /Unknown product type/,
      );
    });

    it('does not tier platform lifts or escalators by stops', async () => {
      const totalAt = async (productType: string, stops: number): Promise<string> =>
        (await calc({ ...WORKED_EXAMPLE, productType, stops, marginPercent: 0, taxPercent: 0 }))
          .pricing.totalPrice;

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
});
