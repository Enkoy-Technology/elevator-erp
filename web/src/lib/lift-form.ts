/**
 * What the lift form knows about each product, kept out of the components
 * so it can be tested: the figures a product starts at, what it asks for,
 * and the price the new quotation previews. Used by the calculator, the
 * start of a quotation and the line editor alike.
 */

import type { CalcInputPayload, CalcResult, ProductTypeRow } from './api';
import {
  isZeroEtb,
  lineTotalEtb,
  subtractEtb,
  sumEtb,
  withVatEtb,
} from './money';

/**
 * A passenger lift is described by its shaft and floors alone: the company's
 * standard table names the lift, and the API fills in the rest. The classic
 * figures below stay for every other product.
 */
export const WORKED_EXAMPLE: CalcInputPayload = {
  productType: 'PASSENGER',
  shaftWidthMm: 1835,
  shaftDepthMm: 1750,
  floors: 12,
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  // The calculator shows the list price only; margin and VAT belong to the
  // quotation, where the statutory rate and the agreed price live.
  marginPercent: 0,
  taxPercent: 0,
};

/** The products the company's shaft table describes: the passenger lift and its finishes. Mirrors the API's PASSENGER_CLASS_PRODUCTS. */
export const STANDARD_LIFT_PRODUCTS: readonly string[] = [
  'PASSENGER',
  'HOSPITAL',
  'PANORAMIC',
  'HOME',
  'CARGO',
];
export const isStandardLift = (productType: string): boolean =>
  STANDARD_LIFT_PRODUCTS.includes(productType);

/**
 * Mirrors the API's vehicle-specs.ts: the speed and door the company's
 * standard specification (2026-10-06) gives each vehicle product and the
 * escalator, which the form starts at when one is chosen.
 */
export const VEHICLE_STANDARD: Readonly<
  Record<
    string,
    {
      speedMs: number;
      doorWidthMm?: number;
      /** The building's opening the form asks for: its document minimum. */
      shaftWidthMm: number;
      /** Absent for the escalator, which takes a width only. */
      shaftDepthMm?: number;
      /** False for the escalator: no rated load. */
      ratedLoad: boolean;
      /** False for the escalator: no machine room to choose. */
      machineRoom?: false;
      /**
       * The price sheet's base N (L for the stacking lift): the passenger
       * example's 12 stops priced a stacking lift at 10.8 M instead of 5.8 M
       * (2026-10-23).
       */
      stops: number;
      /** The escalator's base rise, the one figure its price moves on: 45 m quoted it at 25.5 M against the sheet's 8 M for 10 m. */
      travelHeightM?: number;
    }
  >
> = {
  CAR_LIFT: {
    speedMs: 0.5,
    doorWidthMm: 2600,
    shaftWidthMm: 3400,
    shaftDepthMm: 6500,
    ratedLoad: true,
    stops: 2,
  },
  CAR_PLATFORM_LIFT: {
    speedMs: 0.3,
    doorWidthMm: 2600,
    shaftWidthMm: 2900,
    shaftDepthMm: 5500,
    ratedLoad: true,
    stops: 2,
  },
  CAR_STACKING_LIFT: {
    speedMs: 0.15,
    shaftWidthMm: 3100,
    shaftDepthMm: 5600,
    ratedLoad: true,
    stops: 2,
  },
  ESCALATOR: {
    speedMs: 0.5,
    shaftWidthMm: 1000,
    ratedLoad: false,
    machineRoom: false,
    stops: 2,
    travelHeightM: 6,
  },
};
export const isVehicleProduct = (productType: string): boolean =>
  productType in VEHICLE_STANDARD;
/** Every product but the escalator has a machine room choice. */
export const hasMachineRoom = (productType: string): boolean =>
  VEHICLE_STANDARD[productType]?.machineRoom !== false;
/** An escalator and a car stacking lift have no door. */
export const hasDoor = (productType: string): boolean => {
  const standard = VEHICLE_STANDARD[productType];
  return standard === undefined || standard.doorWidthMm !== undefined;
};

/** The shaft a passenger-class lift had before the form went to a vehicle product. */
export interface PassengerShaft {
  shaftWidthMm?: number;
  shaftDepthMm?: number;
}

/**
 * The figures to start a product at: the company's standard speed, door,
 * opening and the sheet's base stops (and rise) for a vehicle product or
 * escalator; the passenger defaults when coming back from one (a vehicle's
 * figures would be absurd on a passenger lift). That includes its opening:
 * 3400 × 6500 as a passenger shaft quoted the 21-person 1600 kg lift, so
 * the shaft the lift had before goes back, or the worked example's.
 */
export const startingSpeedAndDoor = (
  productType: string,
  current: { productType: string; speedMs: number; doorWidthMm: number },
  passengerShaft: PassengerShaft | null = null,
): {
  speedMs: number;
  doorWidthMm: number;
  shaftWidthMm?: number;
  shaftDepthMm?: number;
  stops?: number;
  travelHeightM?: number;
} => {
  const standard = VEHICLE_STANDARD[productType];
  if (standard) {
    return {
      speedMs: standard.speedMs,
      doorWidthMm: standard.doorWidthMm ?? current.doorWidthMm,
      shaftWidthMm: standard.shaftWidthMm,
      ...(standard.shaftDepthMm !== undefined
        ? { shaftDepthMm: standard.shaftDepthMm }
        : {}),
      stops: standard.stops,
      ...(standard.travelHeightM !== undefined
        ? { travelHeightM: standard.travelHeightM }
        : {}),
    };
  }
  const fromVehicle = Object.values(VEHICLE_STANDARD).some(
    (s) => s.speedMs === current.speedMs,
  );
  return {
    speedMs: fromVehicle ? WORKED_EXAMPLE.speedMs : current.speedMs,
    doorWidthMm:
      current.doorWidthMm >= 2400
        ? WORKED_EXAMPLE.doorWidthMm
        : current.doorWidthMm,
    ...(isVehicleProduct(current.productType)
      ? {
          shaftWidthMm:
            passengerShaft?.shaftWidthMm ?? WORKED_EXAMPLE.shaftWidthMm,
          shaftDepthMm:
            passengerShaft?.shaftDepthMm ?? WORKED_EXAMPLE.shaftDepthMm,
        }
      : {}),
  };
};

/**
 * The capacity to start a product at: its own minimum when the current figure
 * is below it (a car lift is sold from 3,500 kg — better to open on that
 * than to type 1,000 and be told no), otherwise what was there.
 */
export const startingCapacityKg = (
  products: readonly ProductTypeRow[],
  productType: string,
  currentKg: number,
): number => {
  const min = products.find((p) => p.code === productType)?.minCapacityKg;
  return min != null && currentKg < min ? min : currentKg;
};

/**
 * The form once another product is chosen, from the dropdown or from the
 * project: its starting capacity and figures. Leaving a passenger-class lift
 * puts its shaft in `passengerShaft`, which coming back restores.
 */
export const withProduct = (
  form: CalcInputPayload,
  productType: string,
  products: readonly ProductTypeRow[],
  passengerShaft: { current: PassengerShaft | null },
): CalcInputPayload => {
  if (!isVehicleProduct(form.productType)) {
    passengerShaft.current = {
      shaftWidthMm: form.shaftWidthMm,
      shaftDepthMm: form.shaftDepthMm,
    };
  }
  return {
    ...form,
    productType,
    capacityKg: startingCapacityKg(products, productType, form.capacityKg),
    ...startingSpeedAndDoor(productType, form, passengerShaft.current),
  };
};

/** Whether the product's price is its rise (an escalator) — the one product that still asks for it. */
export const usesRise = (
  products: readonly ProductTypeRow[],
  productType: string,
): boolean =>
  /\brise\b/i.test(
    products.find((p) => p.code === productType)?.effectiveFormula ?? '',
  );

/**
 * What the new quotation will hold for this lift, net, VAT and gross, by the
 * server's own rule: when the sheet is VAT-inclusive and VAT is charged at
 * the sheet's own rate, the gross is the sheet figure (with the margin) times
 * the units and VAT is what is left over, so 7,570,000 stays 7,570,000 and
 * not 7,570,000.01; otherwise VAT goes on the net.
 */
export const offerPreviewEtb = (
  pricing: Pick<
    CalcResult['pricing'],
    | 'totalBeforeMargin'
    | 'subtotalWithMargin'
    | 'listVatIncluded'
    | 'listVatPercent'
  >,
  {
    marginPercent,
    quantity,
    vatPercent,
  }: { marginPercent: number; quantity: number; vatPercent: string },
): { netEtb: string; taxEtb: string; grossEtb: string } => {
  // withVatEtb is x + x·p%, half-up to the cent: the margin's rule as well.
  const margin = String(marginPercent);
  const units = String(quantity);
  // The per-unit net the server stores, not one re-derived here: rounding a
  // sub-cent list price and then its margin would land a cent away.
  const netEtb = lineTotalEtb(units, pricing.subtotalWithMargin);
  if (
    pricing.listVatIncluded !== undefined &&
    pricing.listVatPercent !== undefined &&
    isZeroEtb(subtractEtb(vatPercent, pricing.listVatPercent))
  ) {
    const grossEtb = lineTotalEtb(
      units,
      withVatEtb(
        sumEtb([pricing.totalBeforeMargin, pricing.listVatIncluded]),
        margin,
      ).grossEtb,
    );
    return { netEtb, taxEtb: subtractEtb(grossEtb, netEtb), grossEtb };
  }
  return { netEtb, ...withVatEtb(netEtb, vatPercent) };
};
