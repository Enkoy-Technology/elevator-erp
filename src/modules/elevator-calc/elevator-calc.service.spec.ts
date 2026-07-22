import { ElevatorCalcService } from './elevator-calc.service';
import type { CalcInput } from './types';

/** §4.2.4 worked example fixture. */
const WORKED_EXAMPLE: CalcInput = {
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

  describe('§4.2.4 worked example', () => {
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

    it('matches the documented component costs that are formula-exact', () => {
      expect(result.pricing.qBase).toBe('45000.00');
      expect(result.pricing.stopCost).toBe('18000.00');
      expect(result.pricing.capacityMultiplier).toBe('1.00');
      expect(result.pricing.speedPremium).toBe('810.00');
      expect(result.pricing.doorPremium).toBe('0.00');
      // TAD prints 6,885.00 (= 45k×0.15×1.02); formula uses 1.018 → 6,871.50
      expect(result.pricing.installationCost).toBe('6871.50');
      expect(result.pricing.freightCost).toBe('800.00');
    });

    it('produces TOTAL_PRICE from Decimal application of §4.2.1–4.2.3', () => {
      // TAD printed BASE 93,034.62 and TOTAL 156,882.63 disagree with the
      // stated factors (45000×1.80×1.09×1.15×0.92 = 93,410.82). We assert
      // the formula-correct chain.
      expect(result.pricing.baseCost).toBe('93410.82');
      expect(result.pricing.totalPrice).toBe('157358.67');
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
      expect(result.pricing.qBase).toBe('28000.00');
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
    it('raises HOSPITAL car height and installation multiplier', () => {
      const commercial = service.calculateSpecs(WORKED_EXAMPLE);
      const hospital = service.calculateSpecs({
        ...WORKED_EXAMPLE,
        buildingUsage: 'HOSPITAL',
      });
      expect(hospital.technical.carHeightMm).toBe(2350);
      expect(Number(hospital.pricing.installationCost)).toBeGreaterThan(
        Number(commercial.pricing.installationCost),
      );
    });

    it('clamps capacity multiplier at the low end for light cars', () => {
      const result = service.calculateSpecs({
        ...WORKED_EXAMPLE,
        capacityKg: 320,
      });
      // 1 + ((320-1000)/1000)*0.05 = 0.966 → above 0.8 floor
      expect(result.pricing.capacityMultiplier).toBe('0.97');
    });

    it('applies TELESCOPIC door premium of 8% of Q_base', () => {
      const result = service.calculateSpecs({
        ...WORKED_EXAMPLE,
        doorType: 'TELESCOPIC',
      });
      expect(result.pricing.doorPremium).toBe('3600.00');
    });
  });
});
