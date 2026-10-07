export const MACHINE_ROOM_TYPES = ['MR', 'MRL'] as const;
export type MachineRoomType = (typeof MACHINE_ROOM_TYPES)[number];

export const DOOR_TYPES = ['CENTER_OPEN', 'TELESCOPIC', 'SWING'] as const;
export type DoorType = (typeof DOOR_TYPES)[number];

export const BUILDING_USAGES = [
  'RESIDENTIAL',
  'COMMERCIAL',
  'HOSPITAL',
  'INDUSTRIAL',
] as const;
export type BuildingUsage = (typeof BUILDING_USAGES)[number];

/**
 * What is being sold: the `code` of a row in the tenant's product list
 * (`product_types`, editable under Settings). Drives the base price and the
 * per-stop / per-kg rates; the technical block is still computed with the
 * EN 81 lift formulas for any product whose `liftGeometry` is on.
 */
export type ProductType = string;

export interface CalcInput {
  productType: ProductType;
  capacityKg: number;
  stops: number;
  travelHeightM: number;
  speedMs: number;
  machineRoomType: MachineRoomType;
  doorType: DoorType;
  doorWidthMm: number;
  buildingUsage: BuildingUsage;
  marginPercent: number;
  taxPercent: number;
  /**
   * Standard-lift mode (passenger lifts): the building's shaft and floor
   * count pick a row of the company's table, which then fills capacity,
   * stops, travel, speed and door above. Kept on the input so a quotation
   * line remembers what was typed, not only what was derived.
   */
  shaftWidthMm?: number;
  shaftDepthMm?: number;
  floors?: number;
}

/**
 * What the calculator was asked: the classic fields are optional because a
 * passenger lift can be fully described by its shaft and floors instead.
 * `ElevatorCalcService.resolve` turns this into a complete CalcInput.
 */
export type CalcRequest = Pick<
  CalcInput,
  | 'productType'
  | 'marginPercent'
  | 'taxPercent'
  | 'shaftWidthMm'
  | 'shaftDepthMm'
  | 'floors'
> &
  Partial<
    Pick<
      CalcInput,
      | 'capacityKg'
      | 'stops'
      | 'travelHeightM'
      | 'speedMs'
      | 'machineRoomType'
      | 'doorType'
      | 'doorWidthMm'
      | 'buildingUsage'
    >
  >;

/**
 * Every field except `productType` is null for products without lift geometry: §4.1
 * defines EN 81 *lift* geometry, and an escalator has no car, counterweight
 * or guide rail. Nulling them here — at the one place that produces them —
 * is what keeps a counterweight mass off an escalator quotation, since both
 * document renderers and the calculator screen already drop absent keys.
 */
export interface TechnicalSpecs {
  productType: ProductType;
  capacityPersons: number | null;
  carWidthMm: number | null;
  carDepthMm: number | null;
  carHeightMm: number | null;
  /** The shaft the lift is specified for — the building's own, as entered. */
  shaftWidthMm: number | null;
  shaftDepthMm: number | null;
  /**
   * For a standard passenger lift: the table row it is built as, e.g.
   * "8-person lift, 1835 × 1750 mm standard shaft". Null for the classic
   * (computed) geometry and on snapshots taken before this field existed.
   */
  standardLift: string | null;
  pitDepthMm: number | null;
  overheadClearanceMm: number | null;
  counterweightMassKg: string | null;
  motorPowerKw: string | null;
  guideRailSpec: string | null;
  machineRoomWidthMm: number | null;
  machineRoomDepthMm: number | null;
  machineRoomHeightMm: number | null;
}

/** Money fields serialized to 2-decimal strings (ETB). */
export interface PricingBreakdown {
  basePrice: string;
  stopsAdjustment: string;
  capacityAdjustment: string;
  /**
   * Present only when the tenant's price list is VAT-inclusive: the VAT
   * divided out of the list figure so that `totalBeforeMargin` is net.
   * base + stops + capacity − this = totalBeforeMargin.
   */
  listVatIncluded?: string;
  totalBeforeMargin: string;
  marginAmount: string;
  subtotalWithMargin: string;
  taxAmount: string;
  totalPrice: string;
}

export interface CalcResult {
  technical: TechnicalSpecs;
  pricing: PricingBreakdown;
  /** The complete input the figures were computed from — derived fields filled in. */
  input: CalcInput;
  /** Things worth telling the person quoting: a non-standard shaft, a capped speed. */
  notes: string[];
  /** How the list price was built: the formula that applied, and the same with this lift's figures in. */
  formula: { text: string; working: string };
}
