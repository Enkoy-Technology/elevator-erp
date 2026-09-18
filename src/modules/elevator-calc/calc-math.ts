import { Decimal } from 'decimal.js';

import { evaluateFormula } from '../../common/formula';

import type { BuildingUsage, MachineRoomType } from './types';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const D = (value: Decimal.Value): Decimal => new Decimal(value);

const money = (value: Decimal): string =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

const qty2 = (value: Decimal): string =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

/**
 * Product owner's price list, in ETB, before margin and before VAT.
 *
 * The reference machine is 10 stops at 630 kg; a machine with more of either
 * costs the per-unit rate on top. Platform lifts and escalators are flat —
 * their escalation rates are zero, not missing.
 *
 * These are selling prices, not costs: they replace the TAD §4.2 multiplier
 * model wholesale (that matrix was denominated in USD and was relabelled ETB
 * without conversion, which under-quoted every machine by ~100x).
 */
/**
 * The company's list-price formula over base, N (stops), C (kg) and rise;
 * the starter is `base + (N - refN) × perStop + (C - refC) × perKg`,
 * unfloored, with refN/refC the product's own reference machine.
 *

 * The base and both rates come from the tenant's product list, so a product
 * with both rates at zero is a flat price whatever the machine.
 */
/** The three numbers a product row contributes to a price. */
export interface ProductRates {
  basePriceEtb: string;
  perStopEtb: string;
  perKgEtb: string;
  refStops: number;
  refCapacityKg: number;
  kgStep: number;
}

export const computeProductPrice = (
  rates: ProductRates,
  stops: number,
  capacityKg: number,
  travelHeightM: number,
  formula: string,
): {
  basePrice: Decimal;
  stopsAdjustment: Decimal;
  capacityAdjustment: Decimal;
} => {
  const scope = {
    base: rates.basePriceEtb,
    perStop: rates.perStopEtb,
    perKg: rates.perKgEtb,
    refN: rates.refStops,
    refC: rates.refCapacityKg,
    kgStep: rates.kgStep,
    rise: travelHeightM,
  };
  const basePrice = D(rates.basePriceEtb);
  const total = evaluateFormula(formula, { ...scope, N: stops, C: capacityKg });
  // The formula is the company's and need not be additive. Splitting at
  // the product's reference capacity keeps the printed breakdown honest for
  // any formula: what the stops (or an escalator's rise) added, then what
  // the capacity added on top of that.
  const atReferenceCapacity = evaluateFormula(formula, {
    ...scope,
    N: stops,
    C: rates.refCapacityKg,
  });
  return {
    basePrice,
    stopsAdjustment: atReferenceCapacity.minus(basePrice),
    capacityAdjustment: total.minus(atReferenceCapacity),
  };
};

export const passengerCapacity = (capacityKg: number): number =>
  D(capacityKg).div(75).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export const computeCarDimensions = (
  capacityKg: number,
  buildingUsage: BuildingUsage,
): { widthMm: number; depthMm: number; heightMm: number } => {
  const sqrtQ = D(capacityKg).sqrt();
  const widthMm = Decimal.max(
    1100,
    sqrtQ.mul('0.6').plus(200).floor(),
  ).toNumber();
  const depthMm = Decimal.max(
    1400,
    sqrtQ.mul('0.8').plus(300).floor(),
  ).toNumber();
  const heightMm = buildingUsage === 'HOSPITAL' ? 2350 : 2300;
  return { widthMm, depthMm, heightMm };
};

export const computeShaftDimensions = (
  carWidthMm: number,
  carDepthMm: number,
  speedMs: number,
): { widthMm: number; depthMm: number } => {
  const highSpeed = D(speedMs).gt('2.5');
  const wallW = highSpeed ? 200 : 150;
  const wallD = highSpeed ? 250 : 200;
  return {
    widthMm: carWidthMm + 2 * wallW,
    // Section 4 authoritative: car_depth + wall_clearance_d + 100
    depthMm: carDepthMm + wallD + 100,
  };
};

export const computePitDepthMm = (stops: number, speedMs: number): number => {
  const v = D(speedMs);
  const base = D(1400).plus(D(50).mul(stops));
  const speedAdj = Decimal.max(0, v.minus(1).mul(200));
  const highSpeedExtra = v.gt('2.5') ? 200 : 0;
  return base.plus(speedAdj).plus(highSpeedExtra).toDecimalPlaces(0).toNumber();
};

export const computeOverheadClearanceMm = (
  stops: number,
  speedMs: number,
  machineRoomType: MachineRoomType,
): number => {
  const v = D(speedMs);
  const base = D(4200).plus(D(100).mul(stops));
  const speedAdj = Decimal.max(0, v.minus(1).mul(300));
  let overhead = base.plus(speedAdj);
  if (machineRoomType === 'MRL') {
    overhead = overhead.minus(1500);
  }
  return overhead.toDecimalPlaces(0).toNumber();
};

export const computeCounterweightMassKg = (
  capacityKg: number,
  speedMs: number,
  buildingUsage: BuildingUsage,
): Decimal => {
  let factor = D('0.45');
  if (D(speedMs).gt('2.5')) {
    factor = factor.minus('0.05');
  }
  if (buildingUsage === 'INDUSTRIAL') {
    factor = factor.plus('0.05');
  }
  return D(capacityKg).mul(factor);
};

export const computeMotorPowerKw = (
  capacityKg: number,
  speedMs: number,
): Decimal => {
  const v = D(speedMs);
  const mechEff = v.gt('1.75') ? D('0.75') : D('0.60');
  const effFactor = D(1).plus(D('0.1').mul(v.div('2.5')));
  const raw = D(capacityKg)
    .mul(v)
    .mul('9.81')
    .mul(effFactor)
    .div(D(1000).mul(mechEff));
  return Decimal.max(D(3), raw);
};

export const selectGuideRail = (
  capacityKg: number,
  speedMs: number,
): string => {
  const q = capacityKg;
  const v = speedMs;
  if (q <= 630 && v <= 1.0) return 'T75-3/B';
  if (q <= 1000 && v <= 1.6) return 'T89-1/B';
  if (q <= 1600 && v <= 2.5) return 'T114-1/B';
  if (q <= 2500 && v <= 2.5) return 'T127-2/B';
  return 'T140-3/B';
};

export const computeMachineRoom = (
  machineRoomType: MachineRoomType,
  shaftWidthMm: number,
  shaftDepthMm: number,
  speedMs: number,
): {
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
} => {
  if (machineRoomType === 'MRL') {
    return { widthMm: null, depthMm: null, heightMm: null };
  }
  return {
    widthMm: shaftWidthMm + 600,
    depthMm: Math.max(3000, shaftDepthMm + 1000),
    heightMm: D(speedMs).gt('2.5') ? 2700 : 2500,
  };
};

export { money, qty2 };
