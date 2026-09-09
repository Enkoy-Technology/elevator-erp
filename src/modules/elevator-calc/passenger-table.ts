/**
 * The company's standard passenger lifts (client's table, 2026-09-09). A
 * salesperson knows the shaft the building has and how many floors it
 * serves; everything else about the lift follows from those two numbers.
 *
 * `CH` in the client's table is the car height, fixed at 2400 mm. Door is
 * "CO" (centre opening) or "2S" (two-speed side opening, our TELESCOPIC),
 * then width × height.
 */
export const PASSENGER_CAR_HEIGHT_MM = 2400;
export const PASSENGER_DOOR_HEIGHT_MM = 2100;

export type PassengerDoor = 'CO' | '2S';

export interface PassengerLift {
  persons: number;
  loadKg: number;
  /** The table's speed range: 1.0 up to this. */
  maxSpeedMs: number;
  carWidthMm: number;
  carDepthMm: number;
  door: PassengerDoor;
  doorWidthMm: number;
  shaftWidthMm: number;
  shaftDepthMm: number;
}

const row = (
  persons: number,
  loadKg: number,
  maxSpeedMs: number,
  carWidthMm: number,
  carDepthMm: number,
  door: PassengerDoor,
  doorWidthMm: number,
  shaftWidthMm: number,
  shaftDepthMm: number,
): PassengerLift => ({
  persons,
  loadKg,
  maxSpeedMs,
  carWidthMm,
  carDepthMm,
  door,
  doorWidthMm,
  shaftWidthMm,
  shaftDepthMm,
});

export const PASSENGER_LIFTS: readonly PassengerLift[] = [
  row(5, 400, 1.75, 1000, 1000, 'CO', 700, 1650, 1450),
  row(5, 400, 1.75, 1000, 1000, '2S', 800, 1650, 1650),
  row(6, 450, 1.75, 1000, 1250, 'CO', 700, 1550, 1600),
  row(8, 630, 2.0, 1100, 1400, 'CO', 800, 1835, 1750),
  row(8, 630, 2.0, 1100, 1400, '2S', 800, 1600, 1850),
  row(10, 800, 2.0, 1350, 1400, 'CO', 800, 1980, 1750),
  row(13, 1000, 2.0, 1600, 1400, 'CO', 900, 2200, 1750),
  row(13, 1000, 2.0, 1100, 2100, 'CO', 900, 1960, 2450),
  row(15, 1150, 2.0, 1700, 1500, 'CO', 1000, 2430, 1950),
  row(15, 1150, 2.0, 1800, 1450, 'CO', 1000, 2500, 1900),
  row(17, 1275, 2.0, 1400, 2000, 'CO', 1000, 2300, 2400),
  row(18, 1350, 2.0, 2000, 1500, 'CO', 1100, 2700, 1950),
  row(18, 1350, 2.0, 1500, 2000, 'CO', 1100, 2450, 2400),
  row(21, 1600, 2.0, 2100, 1600, 'CO', 1100, 2845, 2000),
  row(21, 1600, 2.0, 1750, 2000, 'CO', 1100, 2575, 2400),
  row(21, 1600, 2.0, 1400, 2400, '2S', 1300, 2350, 2900),
];

/**
 * Rated speed by floors served. The client's bands overlap at 10 and 20;
 * a boundary floor takes the lower band, as agreed.
 */
export const speedForFloors = (floors: number): number => {
  if (floors <= 10) return 1.0;
  if (floors <= 15) return 1.5;
  if (floors <= 20) return 1.75;
  if (floors <= 25) return 2.0;
  return 2.5;
};

export interface PassengerSelection {
  lift: PassengerLift;
  /** True when the shaft entered is exactly a standard shaft. */
  exact: boolean;
}

/**
 * The lift for a shaft. An exact standard shaft names its row; otherwise the
 * largest lift whose shaft fits inside the one entered (most persons, then
 * the one that uses the shaft best). Null when nothing fits.
 */
export const selectPassengerLift = (
  shaftWidthMm: number,
  shaftDepthMm: number,
): PassengerSelection | null => {
  const exact = PASSENGER_LIFTS.find(
    (lift) =>
      lift.shaftWidthMm === shaftWidthMm && lift.shaftDepthMm === shaftDepthMm,
  );
  if (exact) {
    return { lift: exact, exact: true };
  }
  const fitting = PASSENGER_LIFTS.filter(
    (lift) =>
      lift.shaftWidthMm <= shaftWidthMm && lift.shaftDepthMm <= shaftDepthMm,
  ).sort(
    (a, b) =>
      b.persons - a.persons ||
      b.shaftWidthMm * b.shaftDepthMm - a.shaftWidthMm * a.shaftDepthMm,
  );
  const best = fitting[0];
  return best ? { lift: best, exact: false } : null;
};

/** The smallest standard shaft, for the "nothing fits" message. */
export const SMALLEST_PASSENGER_SHAFT = PASSENGER_LIFTS.reduce((min, lift) =>
  lift.shaftWidthMm * lift.shaftDepthMm < min.shaftWidthMm * min.shaftDepthMm
    ? lift
    : min,
);

export const doorLabel = (lift: PassengerLift): string =>
  `${lift.door} ${lift.doorWidthMm} × ${PASSENGER_DOOR_HEIGHT_MM}`;
