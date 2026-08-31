import { Injectable } from '@nestjs/common';

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
import type { CalcInput, CalcResult, TechnicalSpecs } from './types';

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
  calculateSpecs(input: CalcInput): CalcResult {
    const technical =
      input.productType === 'PASSENGER'
        ? computeLiftGeometry(input)
        : EMPTY_GEOMETRY;

    const { basePrice, stopsAdjustment, capacityAdjustment } =
      computeProductPrice(input.productType, input.stops, input.capacityKg);

    const totalBeforeMargin = basePrice
      .plus(stopsAdjustment)
      .plus(capacityAdjustment);
    const marginAmount = totalBeforeMargin.mul(D(input.marginPercent).div(100));
    const subtotalWithMargin = totalBeforeMargin.plus(marginAmount);
    const taxAmount = subtotalWithMargin.mul(D(input.taxPercent).div(100));
    const totalPrice = subtotalWithMargin.plus(taxAmount);

    return {
      technical: { productType: input.productType, ...technical },
      pricing: {
        basePrice: money(basePrice),
        stopsAdjustment: money(stopsAdjustment),
        capacityAdjustment: money(capacityAdjustment),
        totalBeforeMargin: money(totalBeforeMargin),
        marginAmount: money(marginAmount),
        subtotalWithMargin: money(subtotalWithMargin),
        taxAmount: money(taxAmount),
        totalPrice: money(totalPrice),
      },
    };
  }

}

/** The §4.1 EN 81 lift block. Passenger (incl. hospital) lifts only. */
const computeLiftGeometry = (
  input: CalcInput,
): Omit<TechnicalSpecs, 'productType'> => {
    const car = computeCarDimensions(input.capacityKg, input.buildingUsage);
    const shaft = computeShaftDimensions(
      car.widthMm,
      car.depthMm,
      input.speedMs,
    );
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
