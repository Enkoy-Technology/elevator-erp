import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  Max,
  Min,
} from 'class-validator';

import {
  BUILDING_USAGES,
  DOOR_TYPES,
  MACHINE_ROOM_TYPES,
  type BuildingUsage,
  type DoorType,
  type MachineRoomType,
} from '../types';

export class CalculateSpecsDto {
  @ApiProperty({ minimum: 320, maximum: 5000, example: 1000 })
  @IsInt()
  @Min(320)
  @Max(5000)
  capacityKg!: number;

  @ApiProperty({ minimum: 2, maximum: 64, example: 12 })
  @IsInt()
  @Min(2)
  @Max(64)
  stops!: number;

  @ApiProperty({ minimum: 3, maximum: 200, example: 45 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(3)
  @Max(200)
  travelHeightM!: number;

  @ApiProperty({ minimum: 0.4, maximum: 10, example: 1.6 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.4)
  @Max(10)
  speedMs!: number;

  @ApiProperty({ enum: MACHINE_ROOM_TYPES, example: 'MRL' })
  @IsEnum(MACHINE_ROOM_TYPES)
  machineRoomType!: MachineRoomType;

  @ApiProperty({ enum: DOOR_TYPES, example: 'CENTER_OPEN' })
  @IsEnum(DOOR_TYPES)
  doorType!: DoorType;

  @ApiProperty({ minimum: 700, maximum: 1400, example: 900 })
  @IsInt()
  @Min(700)
  @Max(1400)
  doorWidthMm!: number;

  @ApiProperty({ enum: BUILDING_USAGES, example: 'COMMERCIAL' })
  @IsEnum(BUILDING_USAGES)
  buildingUsage!: BuildingUsage;

  @ApiProperty({ minimum: 0, maximum: 100, example: 25 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  marginPercent!: number;

  @ApiProperty({ minimum: 0, maximum: 50, example: 5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  taxPercent!: number;
}
