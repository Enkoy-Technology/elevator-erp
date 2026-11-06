/**
 * The company's standard passenger lifts (client's table, 2026-09-09). A
 * salesperson knows the shaft the building has and how many floors it
 * serves; everything else about the lift follows from those two numbers.
 *
 * `CH` in the client's table is the car height, fixed at 2400 mm. Door is
 * "CO" (centre opening) or "2S" (two-speed side opening), then width × height.
 * The shaft's width now decides the door: see `doorForShaft`. The rows keep
 * the client's own door, and a side-opening door takes its width from them.
 */
export const PASSENGER_CAR_HEIGHT_MM = 2400;

/**
 * The products the table describes: the passenger lift and its finishes.
 * Hospital, panoramic and home elevators are the same machines in another
 * dress and carry the passenger prices, so a shaft and the floors name
 * them too, and so is the cargo lift — "like a passenger elevator, the
 * only difference is the base price" (client, 2026-10-06). Car lifts start
 * above the table's largest machine and have no shaft table, so they stay
 * on their figures.
 */
export const PASSENGER_CLASS_PRODUCTS: readonly string[] = [
  'PASSENGER',
  'HOSPITAL',
  'PANORAMIC',
  'HOME',
  'CARGO',
];
export const usesPassengerTable = (productType: string): boolean =>
  PASSENGER_CLASS_PRODUCTS.includes(productType);
export const PASSENGER_DOOR_HEIGHT_MM = 2100;

export type PassengerDoor = 'CO' | '2S';

export interface PassengerLift {
  persons: number;
  loadKg: number;
  /** The table's speed range: 1.0 up to this. */
  maxSpeedMs: number;
  /** Null on a load the standard table does not have: no car is known. */
  carWidthMm: number | null;
  carDepthMm: number | null;
  door: PassengerDoor;
  doorWidthMm: number;
  /** The shaft the lift needs: a standard row's own, a range's smallest. */
  shaftWidthMm: number;
  shaftDepthMm: number;
  /** A shaft-range row's largest shaft and the range as the client wrote it; null on a standard row. */
  range: { maxWidthMm: number; maxDepthMm: number; asWritten: string } | null;
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
  range: null,
});

export const PASSENGER_LIFTS: readonly PassengerLift[] = [
  row(5, 400, 1.75, 1000, 1000, 'CO', 700, 1650, 1450),
  row(5, 400, 1.75, 1000, 1000, '2S', 800, 1650, 1650),
  row(6, 450, 1.75, 1000, 1250, 'CO', 700, 1550, 1600),
  row(8, 630, 2.0, 1100, 1400, 'CO', 800, 1835, 1750),
  row(8, 630, 2.0, 1100, 1400, '2S', 800, 1600, 1850),
  row(10, 800, 2.0, 1350, 1400, 'CO', 800, 1980, 1750),
  // 1000 kg, as in the client's specification. Rated 800 kg (2026-10-06) it
  // printed 13 persons, which 800 kg cannot carry (client, 2026-10-22).
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

type Shaft = readonly [widthMm: number, depthMm: number];
const shaftText = ([w, d]: Shaft) => `${w} × ${d}`;

/**
 * A row of the client's "capacity and preliminary shaft dimensions" table
 * (2026-11-03): a load, its shaft range and the typical door width. The door
 * is the range's narrowest, as the standard rows have it, and centre-opening.
 * The car and the top speed stay the standard table's, not the range's own
 * speed column (client, 2026-11-04): the load's first row gives the car, and
 * 320 and 1800–3000 kg, which that table lacks, have no car yet and keep the
 * speed limit of its nearest load. The range starts at its first shaft.
 * Some grow in width while they shrink in depth (1600 kg:
 * 2575 × 2400 to 2850 × 2000): those are two shapes of shaft, so a shaft
 * fits the range by holding either one.
 */
const range = (
  persons: number,
  loadKg: number,
  from: Shaft,
  to: Shaft,
  doorWidthMm: number,
  maxSpeedMs: number,
): PassengerLift[] => {
  const standard = PASSENGER_LIFTS.find((lift) => lift.loadKg === loadKg);
  const ends = from[0] <= to[0] && from[1] <= to[1] ? [from] : [from, to];
  return ends.map(([shaftWidthMm, shaftDepthMm]) => ({
    persons,
    loadKg,
    maxSpeedMs,
    carWidthMm: standard?.carWidthMm ?? null,
    carDepthMm: standard?.carDepthMm ?? null,
    door: 'CO',
    doorWidthMm,
    shaftWidthMm,
    shaftDepthMm,
    range: {
      maxWidthMm: Math.max(from[0], to[0]),
      maxDepthMm: Math.max(from[1], to[1]),
      asWritten:
        shaftText(from) === shaftText(to)
          ? shaftText(from)
          : `${shaftText(from)} to ${shaftText(to)}`,
    },
  }));
};

export const PASSENGER_SHAFT_RANGES: readonly PassengerLift[] = [
  range(4, 320, [1200, 1200], [1400, 1400], 600, 1.75),
  range(5, 400, [1400, 1400], [1650, 1450], 700, 1.75),
  range(6, 450, [1500, 1500], [1500, 1500], 700, 1.75),
  range(8, 630, [1600, 1600], [1835, 1750], 800, 2.0),
  range(10, 800, [1800, 1750], [2000, 1800], 800, 2.0),
  range(13, 1000, [1960, 2000], [2200, 2200], 900, 2.0),
  range(15, 1150, [2200, 1900], [2500, 2000], 1000, 2.0),
  range(17, 1275, [2300, 2200], [2400, 2400], 1000, 2.0),
  range(18, 1350, [2450, 2400], [2700, 2000], 1100, 2.0),
  range(21, 1600, [2575, 2400], [2850, 2000], 1100, 2.0),
  range(24, 1800, [2800, 2400], [3000, 2300], 1200, 2.0),
  range(26, 2000, [2900, 2500], [3200, 2400], 1300, 2.0),
  range(33, 2500, [3200, 2800], [3600, 3000], 1400, 2.0),
  range(40, 3000, [3500, 3000], [4000, 3300], 1500, 2.0),
].flat();

/** How a lift's shaft is named on the result and the documents. */
export const shaftLabel = (lift: PassengerLift): string =>
  lift.range
    ? `${lift.range.asWritten} mm shaft range`
    : `${lift.shaftWidthMm} × ${lift.shaftDepthMm} mm standard shaft`;

/** A shaft wider than this takes a centre-opening door; 1.55 m itself does not. */
export const CENTER_OPENING_ABOVE_MM = 1550;

/**
 * The door follows the shaft's width, over what the table's row says (client,
 * 2026-11-06): centre opening above 1.55 m, (W - 200) / 2 wide, in whole
 * millimetres, rounded down so the opening still fits. At 1.55 m or less it is
 * side opening, at the table's width, which the client's rule leaves alone.
 */
export const doorForShaft = (
  shaftWidthMm: number,
  lift: PassengerLift,
): { doorType: 'CENTER_OPEN' | 'SWING'; doorWidthMm: number } =>
  shaftWidthMm > CENTER_OPENING_ABOVE_MM
    ? {
        doorType: 'CENTER_OPEN',
        doorWidthMm: Math.floor((shaftWidthMm - 200) / 2),
      }
    : { doorType: 'SWING', doorWidthMm: lift.doorWidthMm };

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
  /** The company formula's figures for this shaft, before rounding. */
  formulaPersons: number;
  formulaKg: number;
  /** True when the shaft entered is exactly a standard shaft of the chosen load. */
  exact: boolean;
  /** True when no shaft of the load fits inside the one entered; it is quoted all the same. */
  undersized: boolean;
  /** The load's shaft range as written, when the shaft entered is bigger than it; null otherwise. */
  largerThanRange: string | null;
}

/**
 * The shaft a person takes in the company's formula (2026-11-05): 0.33 m².
 * It came as 0.35, then 0.36. In mm², so that a load exactly between two
 * standard ones comes out exact.
 */
export const SHAFT_MM2_PER_PERSON = 330_000;
const KG_PER_PERSON = 75;

const ALL_LIFTS = [...PASSENGER_LIFTS, ...PASSENGER_SHAFT_RANGES];

/** The standard load nearest a figure; exactly between two, the lower. */
const nearestStandardLoad = (kg: number): number =>
  PASSENGER_SHAFT_RANGES.reduce(
    (nearest, { loadKg }) =>
      Math.abs(loadKg - kg) < Math.abs(nearest - kg) ? loadKg : nearest,
    PASSENGER_SHAFT_RANGES[0]!.loadKg,
  );

/**
 * The lift for a shaft, by the company's formula (2026-11-05): W × D over
 * `SHAFT_MM2_PER_PERSON` is the persons, × 75 is the load, and the load goes
 * to the nearest standard one. Only the load is rounded: the persons come
 * from its row, or 10 persons could print beside 630 kg. The formula sees the
 * area and not the shape, so of the rows at that load the shaft takes the one
 * that fits inside it, a standard row first, then the bigger shaft. If none
 * fits it is flagged, not refused (client, 2026-10-23), on the first row
 * whose car goes in the shaft: the documents print the two side by side.
 */
export const selectPassengerLift = (
  shaftWidthMm: number,
  shaftDepthMm: number,
): PassengerSelection => {
  const shaftMm2 = shaftWidthMm * shaftDepthMm;
  const formulaPersons = shaftMm2 / SHAFT_MM2_PER_PERSON;
  const formulaKg = (shaftMm2 * KG_PER_PERSON) / SHAFT_MM2_PER_PERSON;
  const loadKg = nearestStandardLoad(formulaKg);
  const rows = ALL_LIFTS.filter((lift) => lift.loadKg === loadKg);
  const fitting = rows
    .filter(
      (lift) =>
        lift.shaftWidthMm <= shaftWidthMm && lift.shaftDepthMm <= shaftDepthMm,
    )
    .sort(
      (a, b) =>
        Number(a.range !== null) - Number(b.range !== null) ||
        b.shaftWidthMm * b.shaftDepthMm - a.shaftWidthMm * a.shaftDepthMm,
    )[0];
  if (!fitting) {
    const carFits = rows.find(
      (lift) =>
        lift.carWidthMm !== null &&
        lift.carWidthMm < shaftWidthMm &&
        lift.carDepthMm! < shaftDepthMm,
    );
    return {
      lift: carFits ?? rows[0]!,
      formulaPersons,
      formulaKg,
      exact: false,
      undersized: true,
      largerThanRange: null,
    };
  }
  // A standard row names its own shaft in the note instead; several sit
  // outside their load's range, and would be flagged for a millimetre over.
  const usual = fitting.range;
  const larger =
    usual !== null &&
    (shaftWidthMm > usual.maxWidthMm || shaftDepthMm > usual.maxDepthMm);
  return {
    lift: fitting,
    formulaPersons,
    formulaKg,
    exact:
      usual === null &&
      fitting.shaftWidthMm === shaftWidthMm &&
      fitting.shaftDepthMm === shaftDepthMm,
    undersized: false,
    largerThanRange: larger ? usual.asWritten : null,
  };
};
