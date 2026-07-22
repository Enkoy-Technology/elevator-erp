import { Injectable } from '@nestjs/common';

import {
  computeCarDimensions,
  computeCounterweightMassKg,
  computeDoorPremium,
  computeFreightCost,
  computeInstallationCost,
  computeMachineRoom,
  computeMotorPowerKw,
  computeOverheadClearanceMm,
  computePitDepthMm,
  computeShaftDimensions,
  computeSpeedPremium,
  D,
  lookupQBase,
  money,
  passengerCapacity,
  qty2,
  selectGuideRail,
} from './calc-math';
import type { CalcInput, CalcResult } from './types';

@Injectable()
export class ElevatorCalcService {
  calculateSpecs(input: CalcInput): CalcResult {
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

    const qBase = lookupQBase(input.capacityKg);
    const nFactor = D(1).plus(D(input.stops - 2).mul('0.08'));
    const vFactor = D(1).plus(
      DecimalMax0(D(input.speedMs).minus(1)).mul('0.15'),
    );
    const uFactor = D(
      (
        {
          RESIDENTIAL: '1.00',
          COMMERCIAL: '1.15',
          HOSPITAL: '1.25',
          INDUSTRIAL: '1.20',
        } as const
      )[input.buildingUsage],
    );
    const dFactor = D(
      (
        {
          CENTER_OPEN: '1.00',
          TELESCOPIC: '1.12',
          SWING: '0.95',
        } as const
      )[input.doorType],
    );
    const mrFactor = D(input.machineRoomType === 'MRL' ? '0.92' : '1.00');

    const baseCost = qBase
      .mul(nFactor)
      .mul(vFactor)
      .mul(uFactor)
      .mul(dFactor)
      .mul(mrFactor);
    const stopCost = qBase.mul('0.04').mul(input.stops - 2);
    const capacityMultiplier = DecimalClamp(
      D(1).plus(D(input.capacityKg - 1000).div(1000).mul('0.05')),
      D('0.8'),
      D(2),
    );
    const speedPremium = computeSpeedPremium(qBase, input.speedMs);
    const doorPremium = computeDoorPremium(
      qBase,
      input.doorType,
      input.doorWidthMm,
    );
    const installationCost = computeInstallationCost(
      qBase,
      input.travelHeightM,
      input.buildingUsage,
    );
    const freightCost = computeFreightCost(
      shaft.widthMm,
      shaft.depthMm,
      input.travelHeightM,
      counterweight,
    );

    const equipmentSubtotal = baseCost
      .plus(stopCost)
      .plus(speedPremium)
      .plus(doorPremium);
    const totalBeforeMargin = equipmentSubtotal
      .mul(capacityMultiplier)
      .plus(installationCost)
      .plus(freightCost);
    const marginAmount = totalBeforeMargin.mul(D(input.marginPercent).div(100));
    const subtotalWithMargin = totalBeforeMargin.plus(marginAmount);
    const taxAmount = subtotalWithMargin.mul(D(input.taxPercent).div(100));
    const totalPrice = subtotalWithMargin.plus(taxAmount);

    return {
      technical: {
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
      },
      pricing: {
        qBase: money(qBase),
        baseCost: money(baseCost),
        stopCost: money(stopCost),
        capacityMultiplier: qty2(capacityMultiplier),
        speedPremium: money(speedPremium),
        doorPremium: money(doorPremium),
        installationCost: money(installationCost),
        freightCost: money(freightCost),
        equipmentSubtotal: money(equipmentSubtotal),
        totalBeforeMargin: money(totalBeforeMargin),
        marginAmount: money(marginAmount),
        subtotalWithMargin: money(subtotalWithMargin),
        taxAmount: money(taxAmount),
        totalPrice: money(totalPrice),
      },
    };
  }
}

const DecimalMax0 = (value: ReturnType<typeof D>): ReturnType<typeof D> =>
  value.isNeg() ? D(0) : value;

const DecimalClamp = (
  value: ReturnType<typeof D>,
  min: ReturnType<typeof D>,
  max: ReturnType<typeof D>,
): ReturnType<typeof D> => {
  if (value.lt(min)) return min;
  if (value.gt(max)) return max;
  return value;
};
