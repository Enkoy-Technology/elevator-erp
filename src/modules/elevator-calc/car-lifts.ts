/**
 * The car products — car lift, car platform lift, car stacking lift — move
 * a vehicle, not people: slow, with a wide door (client, 2026-10-06).
 * Speed at most 0.25 m/s; door at least 2,500 mm. Enforced on the
 * calculator and mirrored by the forms' starting values.
 */
export const CAR_PRODUCTS: readonly string[] = [
  'CAR_LIFT',
  'CAR_PLATFORM_LIFT',
  'CAR_STACKING_LIFT',
];
export const CAR_LIFT_MAX_SPEED_MS = 0.25;
export const CAR_LIFT_MIN_DOOR_WIDTH_MM = 2500;

export const isCarProduct = (productType: string): boolean =>
  CAR_PRODUCTS.includes(productType);
