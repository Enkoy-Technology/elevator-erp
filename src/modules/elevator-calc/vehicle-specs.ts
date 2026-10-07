/**
 * The client's "Detailed Technical Specifications — Escalator, Car Lift,
 * Car Stacking Lift, Car Platform Lift" (2026-10-06), the source of truth
 * for these four products: the speed, door and shaft a quotation may
 * carry, and the platform that prints as the car. The technical block
 * stays the same compact one every product gets (client, 2026-10-07).
 */
export interface VehicleSpec {
  /** Rated speed the document allows, m/s, and the figure a form starts at. */
  speed: { min: number; max: number; standard: number };
  /** Clear door opening width, mm, where the product has a door. */
  door?: { min: number; max: number; standard: number };
  /** Net platform (car) and clear shaft, mm, where the document gives them. */
  platformMm?: { width: number; depth: number };
  clearShaftMm?: { width: number; depth: number };
  /**
   * The building's opening the salesperson must enter (client, 2026-10-07:
   * every vehicle product takes a shaft width and depth; the escalator a
   * width only) and the least the document allows for it.
   */
  shaftMm: { minWidth: number; minDepth?: number };
  /** False for the escalator: it carries people on steps, not a rated load. */
  ratedLoad: boolean;
}


export const VEHICLE_SPECS: Readonly<Record<string, VehicleSpec>> = {
  ESCALATOR: {
    speed: { min: 0.5, max: 0.65, standard: 0.5 },
    // The structural opening for a 1000 mm step: 1600–1700 mm.
    shaftMm: { minWidth: 1600 },
    ratedLoad: false,
  },
  CAR_LIFT: {
    speed: { min: 0.3, max: 0.5, standard: 0.5 },
    door: { min: 2600, max: 2800, standard: 2600 },
    platformMm: { width: 2800, depth: 5600 },
    clearShaftMm: { width: 3400, depth: 6500 },
    shaftMm: { minWidth: 3400, minDepth: 6500 },
    ratedLoad: true,
  },
  CAR_STACKING_LIFT: {
    speed: { min: 0.08, max: 0.15, standard: 0.15 },
    platformMm: { width: 2800, depth: 5500 },
    // No shaft as such: the overall equipment footprint, 3100–3300 × 5600–6000.
    shaftMm: { minWidth: 3100, minDepth: 5600 },
    ratedLoad: true,
  },
  CAR_PLATFORM_LIFT: {
    speed: { min: 0.15, max: 0.3, standard: 0.3 },
    door: { min: 2400, max: 2800, standard: 2600 },
    platformMm: { width: 2500, depth: 5000 },
    clearShaftMm: { width: 2900, depth: 5500 },
    shaftMm: { minWidth: 2900, minDepth: 5500 },
    ratedLoad: true,
  },
};

export const isVehicleProduct = (productType: string): boolean =>
  productType in VEHICLE_SPECS;

/** An escalator and a car stacking lift have no door to specify (client, 2026-10-07). */
export const hasDoor = (productType: string): boolean => {
  const vehicle = VEHICLE_SPECS[productType];
  return vehicle === undefined || vehicle.door !== undefined;
};

