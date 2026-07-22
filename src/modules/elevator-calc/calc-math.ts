import { Decimal } from 'decimal.js';

import type { BuildingUsage, DoorType, MachineRoomType } from './types';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const D = (value: Decimal.Value): Decimal => new Decimal(value);

const money = (value: Decimal): string =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

const qty2 = (value: Decimal): string =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

const BASE_COST_MATRIX: ReadonlyArray<readonly [number, number]> = [
  [320, 28_000],
  [450, 32_000],
  [630, 36_000],
  [800, 40_000],
  [1000, 45_000],
  [1150, 48_000],
  [1350, 52_000],
  [1600, 58_000],
  [2000, 68_000],
  [2500, 82_000],
  [3000, 95_000],
  [4000, 120_000],
  [5000, 145_000],
];

const U_FACTOR: Record<BuildingUsage, string> = {
  RESIDENTIAL: '1.00',
  COMMERCIAL: '1.15',
  HOSPITAL: '1.25',
  INDUSTRIAL: '1.20',
};

const D_FACTOR: Record<DoorType, string> = {
  CENTER_OPEN: '1.00',
  TELESCOPIC: '1.12',
  SWING: '0.95',
};

const MR_FACTOR: Record<MachineRoomType, string> = {
  MR: '1.00',
  MRL: '0.92',
};

export const lookupQBase = (capacityKg: number): Decimal => {
  const exact = BASE_COST_MATRIX.find(([q]) => q === capacityKg);
  if (exact) {
    return D(exact[1]);
  }
  // Nearest documented capacity at or below Q; clamp to matrix bounds.
  const candidates = BASE_COST_MATRIX.filter(([q]) => q <= capacityKg);
  const row = candidates.at(-1) ?? BASE_COST_MATRIX[0]!;
  return D(row[1]);
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

/**
 * Tiered speed premium on Q_base:
 * +3%/m/s in (1.0, 2.5], +5%/m/s in (2.5, 4.0], +8%/m/s above 4.0.
 */
export const computeSpeedPremium = (qBase: Decimal, speedMs: number): Decimal => {
  const v = D(speedMs);
  if (v.lte(1)) {
    return D(0);
  }
  let premium = D(0);
  const band1 = Decimal.min(v, D('2.5')).minus(1);
  premium = premium.plus(qBase.mul('0.03').mul(Decimal.max(0, band1)));
  if (v.gt('2.5')) {
    const band2 = Decimal.min(v, D(4)).minus('2.5');
    premium = premium.plus(qBase.mul('0.05').mul(Decimal.max(0, band2)));
  }
  if (v.gt(4)) {
    premium = premium.plus(qBase.mul('0.08').mul(v.minus(4)));
  }
  return premium;
};

export const computeDoorPremium = (
  qBase: Decimal,
  doorType: DoorType,
  doorWidthMm: number,
): Decimal => {
  if (doorType === 'TELESCOPIC') {
    return qBase.mul('0.08');
  }
  if (doorType === 'CENTER_OPEN' && doorWidthMm > 1000) {
    const steps = D(doorWidthMm - 1000).div(100).floor();
    return qBase.mul('0.03').mul(steps);
  }
  return D(0);
};

export const computeInstallationCost = (
  qBase: Decimal,
  travelHeightM: number,
  buildingUsage: BuildingUsage,
): Decimal => {
  const heightFactor = D(1).plus(D(travelHeightM).div(50).mul('0.02'));
  let usageFactor = D(1);
  if (buildingUsage === 'HOSPITAL') usageFactor = D('1.2');
  if (buildingUsage === 'INDUSTRIAL') usageFactor = D('1.15');
  return qBase.mul('0.15').mul(heightFactor).mul(usageFactor);
};

export const computeFreightCost = (
  shaftWidthMm: number,
  shaftDepthMm: number,
  travelHeightM: number,
  counterweightMassKg: Decimal,
): Decimal => {
  const volumeTerm = D(shaftWidthMm)
    .mul(shaftDepthMm)
    .mul(travelHeightM)
    .div('1e9')
    .mul(500);
  const weightTerm = counterweightMassKg.div(1000).mul(200);
  return Decimal.max(D(800), volumeTerm.plus(weightTerm));
};

export { money, qty2 };
