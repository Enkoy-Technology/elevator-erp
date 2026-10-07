import { BadRequestException, Injectable } from '@nestjs/common';

import { FormulaError, renderFormula } from '../../common/formula';

import {
  computeCarDimensions,
  computeCounterweightMassKg,
  computeMachineRoom,
  computeMotorPowerKw,
  computeOverheadClearanceMm,
  computePitDepthMm,
  computeProductPrice,
  computeShaftDimensions,
  D,
  money,
  passengerCapacity,
  qty2,
  selectGuideRail,
} from './calc-math';
import { VEHICLE_SPECS } from './vehicle-specs';
import {
  PASSENGER_CAR_HEIGHT_MM,
  selectPassengerLift,
  speedForFloors,
  usesPassengerTable,
} from './passenger-table';
import { ProductTypesRepository } from './product-types.repository';
import type {
  CalcInput,
  CalcResult,
  TechnicalSpecs,
  CalcRequest,
} from './types';

/**
 * §4.1 defines lift geometry only. Escalators and car platform lifts are
 * priced flat (§4.2.1) and have no EN 81 car, shaft, counterweight or rail —
 * so they carry no technical block rather than a lift's one.
 */
const EMPTY_GEOMETRY: Omit<TechnicalSpecs, 'productType'> = {
  capacityPersons: null,
  carWidthMm: null,
  carDepthMm: null,
  carHeightMm: null,
  shaftWidthMm: null,
  shaftDepthMm: null,
  standardLift: null,
  pitDepthMm: null,
  overheadClearanceMm: null,
  counterweightMassKg: null,
  motorPowerKw: null,
  guideRailSpec: null,
  machineRoomWidthMm: null,
  machineRoomDepthMm: null,
  machineRoomHeightMm: null,
};

@Injectable()
export class ElevatorCalcService {
  constructor(private readonly productTypes: ProductTypesRepository) {}

  async calculateSpecs(
    tenantId: string,
    request: CalcRequest,
  ): Promise<CalcResult> {
    const [product, { formula, priceListVatPercent }] = await Promise.all([
      this.productTypes.findByCode(tenantId, request.productType),
      this.productTypes.pricingSettings(tenantId),
    ]);
    if (!product) {
      throw new BadRequestException(
        `Unknown product type "${request.productType}" — add it under Settings → Products & prices`,
      );
    }

    const { input, technical, notes } = resolve(request, product.liftGeometry);
    if (
      product.minCapacityKg !== null &&
      input.capacityKg < product.minCapacityKg
    ) {
      throw new BadRequestException(
        `${product.name} is sold from ${product.minCapacityKg.toLocaleString('en-US')} kg — ${input.capacityKg.toLocaleString('en-US')} kg is below the minimum.`,
      );
    }
    const vehicle = VEHICLE_SPECS[product.code];
    if (vehicle) {
      if (input.speedMs < vehicle.speed.min || input.speedMs > vehicle.speed.max) {
        throw new BadRequestException(
          `${product.name} is specified at ${vehicle.speed.min}–${vehicle.speed.max} m/s — ${input.speedMs} m/s is outside the company's standard.`,
        );
      }
      if (
        vehicle.door &&
        (input.doorWidthMm < vehicle.door.min ||
          input.doorWidthMm > vehicle.door.max)
      ) {
        throw new BadRequestException(
          `${product.name} is specified with a ${vehicle.door.min.toLocaleString('en-US')}–${vehicle.door.max.toLocaleString('en-US')} mm door opening — ${input.doorWidthMm.toLocaleString('en-US')} mm is outside the company's standard.`,
        );
      }
    }

    let priced: ReturnType<typeof computeProductPrice>;
    try {
      priced = computeProductPrice(
        product,
        input.stops,
        input.capacityKg,
        input.travelHeightM,
        product.formula ?? formula,
      );
    } catch (err) {
      if (err instanceof FormulaError) {
        throw new BadRequestException(
          `The pricing formula ${product.formula ? `on ${product.name}` : 'under Settings'} cannot be evaluated: ${err.message}`,
        );
      }
      throw err;
    }
    const { basePrice, stopsAdjustment, capacityAdjustment } = priced;
    const listPrice = basePrice.plus(stopsAdjustment).plus(capacityAdjustment);
    if (!listPrice.isFinite() || listPrice.isNegative()) {
      throw new BadRequestException(
        `The pricing formula under Settings gives ${listPrice.toFixed(2)} for ${input.stops} stops at ${input.capacityKg} kg; a list price cannot be negative.`,
      );
    }
    // The client's sheet is gross — 7,000,000 is what the customer pays,
    // VAT in — so the net is the list divided by 1.15, and VAT is what is
    // left, not list × 15%: that way net + VAT is the sheet figure exactly.
    const listVatIncluded =
      priceListVatPercent === null || D(priceListVatPercent).isZero()
        ? null
        : listPrice.minus(
            listPrice.div(D(1).plus(D(priceListVatPercent).div(100))).toDP(2),
          );
    const totalBeforeMargin =
      listVatIncluded === null ? listPrice : listPrice.minus(listVatIncluded);
    const marginAmount = totalBeforeMargin.mul(D(input.marginPercent).div(100));
    const subtotalWithMargin = totalBeforeMargin.plus(marginAmount);
    const taxAmount = subtotalWithMargin.mul(D(input.taxPercent).div(100));
    const totalPrice = subtotalWithMargin.plus(taxAmount);

    const productValues = {
      perStop: product.perStopEtb,
      perKg: product.perKgEtb,
      refN: product.refStops,
      refC: product.refCapacityKg,
      kgStep: product.kgStep,
    };
    const applied = product.formula ?? formula;

    return {
      technical,
      formula: {
        text: renderFormula(applied, productValues),
        working: `${renderFormula(applied, {
          ...productValues,
          base: product.basePriceEtb,
          N: input.stops,
          C: input.capacityKg,
          rise: input.travelHeightM,
        })} = ${renderFormula(money(listPrice), {})}${
          listVatIncluded === null
            ? ''
            : `; less ${priceListVatPercent}% VAT included in the list = ${renderFormula(money(totalBeforeMargin), {})}`
        }`,
      },
      pricing: {
        basePrice: money(basePrice),
        stopsAdjustment: money(stopsAdjustment),
        capacityAdjustment: money(capacityAdjustment),
        ...(listVatIncluded === null
          ? {}
          : { listVatIncluded: money(listVatIncluded) }),
        totalBeforeMargin: money(totalBeforeMargin),
        marginAmount: money(marginAmount),
        subtotalWithMargin: money(subtotalWithMargin),
        taxAmount: money(taxAmount),
        totalPrice: money(totalPrice),
      },
      input,
      notes,
    };
  }
}

/**
 * Complete the request. Standard-lift mode (a passenger-class request
 * carrying a shaft and floors) reads the company's table: the shaft picks the lift,
 * the floors give stops, travel (3.0 m a floor) and the speed band, capped
 * at what that lift allows. The technical block is then exactly what the
 * table says — car, door, shaft, persons — and nothing else. Classic mode
 * requires every figure and computes the EN 81 geometry as before.
 */
const resolve = (
  request: CalcRequest,
  liftGeometry: boolean,
): { input: CalcInput; technical: TechnicalSpecs; notes: string[] } => {
  const notes: string[] = [];
  const machineRoomType = request.machineRoomType ?? 'MRL';
  const buildingUsage = request.buildingUsage ?? 'COMMERCIAL';

  const standard =
    usesPassengerTable(request.productType) &&
    request.shaftWidthMm !== undefined &&
    request.shaftDepthMm !== undefined &&
    request.floors !== undefined;

  if (standard) {
    const shaftWidthMm = request.shaftWidthMm!;
    const shaftDepthMm = request.shaftDepthMm!;
    const floors = request.floors!;
    const { lift, exact } = selectPassengerLift(shaftWidthMm, shaftDepthMm);
    if (!exact) {
      notes.push(
        `${shaftWidthMm} × ${shaftDepthMm} mm is not a standard shaft; the next standard size is the ${lift.persons}-person (${lift.shaftWidthMm} × ${lift.shaftDepthMm} mm shaft).`,
      );
    }
    const bandSpeed = speedForFloors(floors);
    const speedMs = Math.min(bandSpeed, lift.maxSpeedMs);
    if (speedMs < bandSpeed) {
      notes.push(
        `${floors} floors call for ${bandSpeed} m/s; this lift's maximum is ${lift.maxSpeedMs} m/s, so that is what is quoted.`,
      );
    }
    const input: CalcInput = {
      productType: request.productType,
      capacityKg: lift.loadKg,
      stops: floors,
      // The client's rule: 3,500 mm per floor, times the floor count.
      travelHeightM: Number((floors * FLOOR_HEIGHT_M).toFixed(2)),
      speedMs,
      machineRoomType,
      doorType: lift.door === 'CO' ? 'CENTER_OPEN' : 'TELESCOPIC',
      doorWidthMm: lift.doorWidthMm,
      buildingUsage,
      marginPercent: request.marginPercent,
      taxPercent: request.taxPercent,
      shaftWidthMm,
      shaftDepthMm,
      floors,
    };
    const technical: TechnicalSpecs = {
      ...EMPTY_GEOMETRY,
      productType: request.productType,
      capacityPersons: lift.persons,
      carWidthMm: lift.carWidthMm,
      carDepthMm: lift.carDepthMm,
      carHeightMm: PASSENGER_CAR_HEIGHT_MM,
      // The building's shaft, as entered — what the salesperson typed must
      // be what the spec sheet says. The standard row it maps to is named
      // beside it rather than silently replacing it.
      shaftWidthMm,
      shaftDepthMm,
      standardLift: `${lift.persons}-person lift, ${lift.shaftWidthMm} × ${lift.shaftDepthMm} mm standard shaft`,
    };
    return { input, technical, notes };
  }

  const vehicle = VEHICLE_SPECS[request.productType];
  const required: (keyof CalcRequest)[] = [
    'stops',
    'speedMs',
    'doorType',
    'doorWidthMm',
  ];
  if (!vehicle || vehicle.ratedLoad) {
    required.push('capacityKg');
  }
  if (vehicle) {
    // Every vehicle product is quoted against the building's opening; the
    // escalator against its width alone (client, 2026-10-07).
    required.push('shaftWidthMm');
    if (vehicle.shaftMm.minDepth !== undefined) {
      required.push('shaftDepthMm');
    }
  }
  const missing = required.filter((key) => request[key] === undefined);
  if (missing.length > 0) {
    throw new BadRequestException(
      usesPassengerTable(request.productType)
        ? 'Give the shaft (shaftWidthMm, shaftDepthMm) and floors, or every figure: ' +
            missing.join(', ')
        : `Missing ${missing.join(', ')}`,
    );
  }
  if (vehicle) {
    const { minWidth, minDepth } = vehicle.shaftMm;
    if (request.shaftWidthMm! < minWidth) {
      throw new BadRequestException(
        `${request.productType === 'ESCALATOR' ? 'An escalator' : 'This product'} needs an opening at least ${minWidth.toLocaleString('en-US')} mm wide — ${request.shaftWidthMm!.toLocaleString('en-US')} mm is below the company's standard.`,
      );
    }
    if (minDepth !== undefined && request.shaftDepthMm! < minDepth) {
      throw new BadRequestException(
        `This product needs a shaft at least ${minDepth.toLocaleString('en-US')} mm deep — ${request.shaftDepthMm!.toLocaleString('en-US')} mm is below the company's standard.`,
      );
    }
  }
  const input: CalcInput = {
    productType: request.productType,
    // An escalator has no rated load; 0 keeps the price formula's C defined.
    capacityKg: vehicle && !vehicle.ratedLoad ? 0 : request.capacityKg!,
    stops: request.stops!,
    // The client's rule for every lift: 3,500 mm per floor × the stops.
    // Only an escalator sends its own figure — its price is its rise.
    travelHeightM:
      request.travelHeightM ??
      Number((request.stops! * FLOOR_HEIGHT_M).toFixed(2)),
    speedMs: request.speedMs!,
    machineRoomType,
    doorType: request.doorType!,
    doorWidthMm: request.doorWidthMm!,
    buildingUsage,
    marginPercent: request.marginPercent,
    taxPercent: request.taxPercent,
    ...(vehicle
      ? { shaftWidthMm: request.shaftWidthMm, shaftDepthMm: request.shaftDepthMm }
      : {}),
  };
  if (vehicle) {
    // The company's standard figures, not EN 81 geometry: the platform is
    // the car, the building's opening the shaft; no machine to size.
    const technical: TechnicalSpecs = {
      ...EMPTY_GEOMETRY,
      productType: input.productType,
      carWidthMm: vehicle.platformMm?.width ?? null,
      carDepthMm: vehicle.platformMm?.depth ?? null,
      // The building's opening, as entered; the document's clear shaft is
      // on the sheet beside it.
      shaftWidthMm: request.shaftWidthMm ?? null,
      shaftDepthMm: request.shaftDepthMm ?? null,
    };
    return { input, technical, notes };
  }
  const technical: TechnicalSpecs = {
    productType: input.productType,
    ...(liftGeometry ? computeLiftGeometry(input) : EMPTY_GEOMETRY),
  };
  return { input, technical, notes };
};

/** Floor pitch when only the floor count is known — the client's 3,500 mm per floor. */
const FLOOR_HEIGHT_M = 3.5;

/** The §4.1 EN 81 lift block, for every product with lift geometry on. */
const computeLiftGeometry = (
  input: CalcInput,
): Omit<TechnicalSpecs, 'productType'> => {
  const car = computeCarDimensions(input.capacityKg, input.buildingUsage);
  const shaft = computeShaftDimensions(car.widthMm, car.depthMm, input.speedMs);
  const counterweight = computeCounterweightMassKg(
    input.capacityKg,
    input.speedMs,
    input.buildingUsage,
  );
  const motorKw = computeMotorPowerKw(input.capacityKg, input.speedMs);
  const machineRoom = computeMachineRoom(
    input.machineRoomType,
    shaft.widthMm,
    shaft.depthMm,
    input.speedMs,
  );

  return {
    capacityPersons: passengerCapacity(input.capacityKg),
    carWidthMm: car.widthMm,
    carDepthMm: car.depthMm,
    carHeightMm: car.heightMm,
    shaftWidthMm: shaft.widthMm,
    shaftDepthMm: shaft.depthMm,
    standardLift: null,
    pitDepthMm: computePitDepthMm(input.stops, input.speedMs),
    overheadClearanceMm: computeOverheadClearanceMm(
      input.stops,
      input.speedMs,
      input.machineRoomType,
    ),
    counterweightMassKg: qty2(counterweight),
    motorPowerKw: qty2(motorKw),
    guideRailSpec: selectGuideRail(input.capacityKg, input.speedMs),
    machineRoomWidthMm: machineRoom.widthMm,
    machineRoomDepthMm: machineRoom.depthMm,
    machineRoomHeightMm: machineRoom.heightMm,
  };
};
