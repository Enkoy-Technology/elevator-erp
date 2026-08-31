import { Decimal } from 'decimal.js';

import type {
  BuildingUsage,
  MachineRoomType,
  ProductType,
} from './types';

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
/** Rows are ordered high-to-low; the first the machine reaches wins. */
type BaseTier = { readonly fromStops: number; readonly base: string };

/** Passenger/hospital base steps up with building height. */
const PASSENGER_BASE_TIERS: readonly BaseTier[] = [
  { fromStops: 31, base: '11000000' },
  { fromStops: 20, base: '8000000' },
  { fromStops: 0, base: '7000000' },
];

const PRICE_LIST: Record<
  ProductType,
  {
    baseTiers: readonly BaseTier[];
    perStopAbove10: string;
    perKgAbove630: string;
  }
> = {
  PASSENGER: {
    baseTiers: PASSENGER_BASE_TIERS,
    perStopAbove10: '80000',
    perKgAbove630: '1000',
  },
  CAR_PLATFORM_LIFT: {
    baseTiers: [{ fromStops: 0, base: '5200000' }],
    perStopAbove10: '0',
    perKgAbove630: '0',
  },
  ESCALATOR: {
    baseTiers: [{ fromStops: 0, base: '6000000' }],
    perStopAbove10: '0',
    perKgAbove630: '0',
  },
};

export const REFERENCE_STOPS = 10;
export const REFERENCE_CAPACITY_KG = 630;

/**
 * `base(N) + max(0, N - 10) × rate_stop + max(0, Q - 630) × rate_kg`.
 *
 * Both adjustments floor at the reference point: an under-spec machine still
 * costs the base, it never prices below it.
 *
 * The stop reference stays at 10 in every tier — a 20-stop passenger lift is
 * 8,000,000 + 10 × 80,000, not 8,000,000 flat. That is the literal reading of
 * "same formula, different base"; the tier boundary is where the base jumps,
 * not where the per-stop count restarts.
 */
export const computeProductPrice = (
  productType: ProductType,
  stops: number,
  capacityKg: number,
): {
  basePrice: Decimal;
  stopsAdjustment: Decimal;
  capacityAdjustment: Decimal;
} => {
  const rates = PRICE_LIST[productType];
  // Every tier list ends at fromStops: 0, so one row always matches.
  const tier = rates.baseTiers.find((t) => stops >= t.fromStops)!;
  const stopsOver = Decimal.max(0, D(stops).minus(REFERENCE_STOPS));
  const kgOver = Decimal.max(0, D(capacityKg).minus(REFERENCE_CAPACITY_KG));
  return {
    basePrice: D(tier.base),
    stopsAdjustment: stopsOver.mul(rates.perStopAbove10),
    capacityAdjustment: kgOver.mul(rates.perKgAbove630),
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

export const selectGuideRail = (capacityKg: number, speedMs: number): string => {
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
