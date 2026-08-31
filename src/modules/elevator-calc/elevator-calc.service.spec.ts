import { ElevatorCalcService } from './elevator-calc.service';
import type { CalcInput } from './types';

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
  const service = new ElevatorCalcService();

  describe('§4.2.3 worked example', () => {
    const result = service.calculateSpecs(WORKED_EXAMPLE);

    it('computes technical specs for the fixture', () => {
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

    it('prices off the product price list, not the retired TAD matrix', () => {
      // 12 stops, 1000 kg PASSENGER:
      //   7,000,000 + (12-10)×80,000 + (1000-630)×1,000 = 7,530,000
      expect(result.pricing.basePrice).toBe('7000000.00');
      expect(result.pricing.stopsAdjustment).toBe('160000.00');
      expect(result.pricing.capacityAdjustment).toBe('370000.00');
      expect(result.pricing.totalBeforeMargin).toBe('7530000.00');
    });

    it('applies margin then tax on top of the list price', () => {
      // 7,530,000 × 1.25 = 9,412,500 ; × 1.05 = 9,883,125
      expect(result.pricing.marginAmount).toBe('1882500.00');
      expect(result.pricing.subtotalWithMargin).toBe('9412500.00');
      expect(result.pricing.totalPrice).toBe('9883125.00');
    });
  });

  describe('price list', () => {
    it('floors both adjustments at the reference machine (10 stops, 630 kg)', () => {
      const result = service.calculateSpecs({
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

    it('steps the passenger base up at 20 and 31 stops', () => {
      // Held at 630 kg so the capacity term is zero and only the base moves.
      const priceAt = (stops: number): string =>
        service.calculateSpecs({
          ...WORKED_EXAMPLE,
          stops,
          capacityKg: 630,
          marginPercent: 0,
          taxPercent: 0,
        }).pricing.basePrice;

      expect(priceAt(19)).toBe('7000000.00');
      expect(priceAt(20)).toBe('8000000.00');
      expect(priceAt(30)).toBe('8000000.00');
      expect(priceAt(31)).toBe('11000000.00');
    });

    it('keeps the stop reference at 10 inside every base tier', () => {
      const totalAt = (stops: number): string =>
        service.calculateSpecs({
          ...WORKED_EXAMPLE,
          stops,
          capacityKg: 630,
          marginPercent: 0,
          taxPercent: 0,
        }).pricing.totalPrice;

      // 8,000,000 + (20-10)×80,000
      expect(totalAt(20)).toBe('8800000.00');
      // 11,000,000 + (31-10)×80,000
      expect(totalAt(31)).toBe('12680000.00');
    });

    it('does not tier platform lifts or escalators by stops', () => {
      const totalAt = (productType: CalcInput['productType'], stops: number): string =>
        service.calculateSpecs({
          ...WORKED_EXAMPLE,
          productType,
          stops,
          marginPercent: 0,
          taxPercent: 0,
        }).pricing.totalPrice;

      expect(totalAt('CAR_PLATFORM_LIFT', 40)).toBe('5200000.00');
      expect(totalAt('ESCALATOR', 40)).toBe('6000000.00');
    });

    it('prices a car platform lift flat, ignoring stops and capacity', () => {
      const platformLift: CalcInput = {
        ...WORKED_EXAMPLE,
        productType: 'CAR_PLATFORM_LIFT',
        marginPercent: 0,
        taxPercent: 0,
      };
      const small = service.calculateSpecs({
        ...platformLift,
        stops: 4,
        capacityKg: 630,
      });
      const big = service.calculateSpecs({
        ...platformLift,
        stops: 20,
        capacityKg: 5000,
      });
      expect(small.pricing.totalPrice).toBe('5200000.00');
      expect(big.pricing.totalPrice).toBe('5200000.00');
    });

    it('prices an escalator flat', () => {
      const result = service.calculateSpecs({
        ...WORKED_EXAMPLE,
        productType: 'ESCALATOR',
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.totalPrice).toBe('6000000.00');
    });

    it('does not vary price by speed, door, machine room or building usage', () => {
      const plain = service.calculateSpecs({ ...WORKED_EXAMPLE });
      const loaded = service.calculateSpecs({
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
    it('handles minimum capacity and MRL overhead reduction', () => {
      const result = service.calculateSpecs({
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

    it('applies high-speed and INDUSTRIAL counterweight adjustments', () => {
      const result = service.calculateSpecs({
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

    it('drops to T140 rail when speed exceeds the T127 band', () => {
      const result = service.calculateSpecs({
        ...WORKED_EXAMPLE,
        capacityKg: 2500,
        speedMs: 3.0,
        machineRoomType: 'MR',
      });
      expect(result.technical.guideRailSpec).toBe('T140-3/B');
    });
    it('raises HOSPITAL car height', () => {
      const hospital = service.calculateSpecs({
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
      (productType) => {
        const result = service.calculateSpecs({
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

    it('keeps the full lift geometry for PASSENGER', () => {
      const result = service.calculateSpecs(WORKED_EXAMPLE);
      expect(result.technical.productType).toBe('PASSENGER');
      expect(result.technical.guideRailSpec).toBe('T89-1/B');
      expect(result.technical.carWidthMm).toBe(1100);
    });
  });
});
