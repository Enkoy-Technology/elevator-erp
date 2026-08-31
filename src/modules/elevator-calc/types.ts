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
 * What is being sold. Drives pricing only — the technical block is still
 * computed with the EN 81 lift formulas regardless.
 *
 * PASSENGER covers hospital lifts: the product owner prices them identically,
 * and `buildingUsage: 'HOSPITAL'` already carries the distinction (taller car,
 * and it is what the quote document reads).
 */
export const PRODUCT_TYPES = [
  'PASSENGER',
  'CAR_PLATFORM_LIFT',
  'ESCALATOR',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

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
}

/**
 * Every field except `productType` is null for non-PASSENGER products: §4.1
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
  shaftWidthMm: number | null;
  shaftDepthMm: number | null;
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
  totalBeforeMargin: string;
  marginAmount: string;
  subtotalWithMargin: string;
  taxAmount: string;
  totalPrice: string;
}

export interface CalcResult {
  technical: TechnicalSpecs;
  pricing: PricingBreakdown;
}
