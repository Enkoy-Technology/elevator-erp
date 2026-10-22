import type {
  CreateQuotationLinePayload,
  ProductType,
  ProductTypeRow,
} from '../../../../lib/api';
import {
  VEHICLE_STANDARD,
  hasDoor,
  hasMachineRoom,
  isStandardLift,
  usesRise,
} from '../../../../lib/lift-form';

/** Everything a line holds, as strings — what the inputs actually carry. */
export interface LineDraft {
  productType: ProductType;
  /** A passenger lift is picked from the standard table by its shaft. */
  shaftWidthMm: string;
  shaftDepthMm: string;
  capacityKg: string;
  stops: string;
  travelHeightM: string;
  speedMs: string;
  machineRoomType: 'MR' | 'MRL';
  doorType: 'CENTER_OPEN' | 'TELESCOPIC' | 'SWING';
  doorWidthMm: string;
  buildingUsage: 'RESIDENTIAL' | 'COMMERCIAL' | 'HOSPITAL' | 'INDUSTRIAL';
  marginPercent: string;
  quantity: string;
  machineRoomLabel: string;
  floorLabels: string;
  floorDisplaySummary: string;
  doorHeightMm: string;
  ropingRatio: string;
  tractionMachineType: string;
  controlSystem: string;
  powerSupply: string;
  lightSupply: string;
  entranceCount: string;
  specSummary: string;
}

/**
 * The spec-sheet half is prefilled from the client's own proforma rather
 * than left blank: those ten rows are the same on nine quotes out of ten,
 * and a blank field is what made them paste boilerplate that then drifted
 * (their page 2 says Simplex where page 3 says Duplex). Typed-over when
 * a lift is genuinely different, ignored otherwise.
 */
export const NEW_LINE: LineDraft = {
  productType: 'PASSENGER',
  shaftWidthMm: '1835',
  shaftDepthMm: '1750',
  capacityKg: '1000',
  stops: '12',
  travelHeightM: '45',
  speedMs: '1.6',
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: '900',
  buildingUsage: 'COMMERCIAL',
  marginPercent: '0',
  quantity: '1',
  machineRoomLabel: 'MRL',
  floorLabels: '',
  floorDisplaySummary: '',
  doorHeightMm: '2100',
  ropingRatio: '2:1',
  tractionMachineType: 'Gearless',
  controlSystem: 'Simplex',
  powerSupply: '380V AC 50HZ 3-phase 4 lines',
  lightSupply: '240V AC 50HZ Single phase',
  entranceCount: '1',
  specSummary: '',
};

export const num = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : fallback;
};

/**
 * A calculation box left blank is left out, not filled with the demo lift:
 * a cleared shaft width was saved as 1835 and quoted the 8-person lift
 * (2026-10-23). The server keeps the stored figure on an update and refuses
 * an add that lacks one.
 */
const figure = (value: string): number | undefined => {
  // Not a number at all ('.', '1..') is blank too: NaN would go out as null.
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) ? undefined : parsed;
};

/** Blank means "leave it alone": the API's validators reject null on every
 *  spec field, so an empty box omits the key instead of blanking it. */
const text = (value: string): string | undefined =>
  value.trim() === '' ? undefined : value.trim();

export const toPayload = (
  draft: LineDraft,
  products: readonly ProductTypeRow[],
): CreateQuotationLinePayload => {
  const floorLabels = text(draft.floorLabels);
  return {
    productType: draft.productType,
    // Shaft and floors for a standard lift; the classic figures for the rest.
    // Stops (or the floor labels) double as the floor count.
    ...(isStandardLift(draft.productType)
      ? {
          shaftWidthMm: figure(draft.shaftWidthMm),
          shaftDepthMm: figure(draft.shaftDepthMm),
        }
      : {
          // A vehicle product is quoted against the building's opening; an
          // escalator against its width alone, and carries no rated load.
          ...(VEHICLE_STANDARD[draft.productType]
            ? {
                shaftWidthMm: figure(draft.shaftWidthMm),
                ...(VEHICLE_STANDARD[draft.productType]?.shaftDepthMm !==
                undefined
                  ? { shaftDepthMm: figure(draft.shaftDepthMm) }
                  : {}),
              }
            : {}),
          ...(VEHICLE_STANDARD[draft.productType]?.ratedLoad === false
            ? {}
            : { capacityKg: figure(draft.capacityKg) }),
          // Travel is 3.5 m × stops on the API; only a rise-priced product (escalator) sends it.
          ...(usesRise(products, draft.productType)
            ? { travelHeightM: figure(draft.travelHeightM) }
            : {}),
          speedMs: figure(draft.speedMs),
          ...(hasDoor(draft.productType)
            ? {
                doorType: draft.doorType,
                doorWidthMm: figure(draft.doorWidthMm),
              }
            : {}),
        }),
    ...(hasMachineRoom(draft.productType)
      ? { machineRoomType: draft.machineRoomType }
      : {}),
    buildingUsage: draft.buildingUsage,
    marginPercent: num(draft.marginPercent, 0),
    quantity: num(draft.quantity, 1),
    // Floors win where they are given — their count IS the stop count, and
    // sending both invites the two to disagree.
    ...(floorLabels ? { floorLabels } : { stops: figure(draft.stops) }),
    // An escalator has no machine room; the API clears its label.
    machineRoomLabel: hasMachineRoom(draft.productType)
      ? text(draft.machineRoomLabel)
      : undefined,
    // Sent even when empty, unlike its neighbours: an empty value is a
    // meaningful instruction here — print the compressed form again.
    floorDisplaySummary: draft.floorDisplaySummary.trim(),
    doorHeightMm: draft.doorHeightMm.trim()
      ? num(draft.doorHeightMm, 2100)
      : undefined,
    ropingRatio: text(draft.ropingRatio),
    tractionMachineType: text(draft.tractionMachineType),
    controlSystem: text(draft.controlSystem),
    powerSupply: text(draft.powerSupply),
    lightSupply: text(draft.lightSupply),
    entranceCount: draft.entranceCount.trim()
      ? num(draft.entranceCount, 1)
      : undefined,
    specSummary: text(draft.specSummary),
  };
};
