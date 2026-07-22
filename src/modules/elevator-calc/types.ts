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

export interface CalcInput {
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

export interface TechnicalSpecs {
  capacityPersons: number;
  carWidthMm: number;
  carDepthMm: number;
  carHeightMm: number;
  shaftWidthMm: number;
  shaftDepthMm: number;
  pitDepthMm: number;
  overheadClearanceMm: number;
  counterweightMassKg: string;
  motorPowerKw: string;
  guideRailSpec: string;
  machineRoomWidthMm: number | null;
  machineRoomDepthMm: number | null;
  machineRoomHeightMm: number | null;
}

/** Money fields serialized to 2-decimal strings (ETB). */
export interface PricingBreakdown {
  qBase: string;
  baseCost: string;
  stopCost: string;
  capacityMultiplier: string;
  speedPremium: string;
  doorPremium: string;
  installationCost: string;
  freightCost: string;
  equipmentSubtotal: string;
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
