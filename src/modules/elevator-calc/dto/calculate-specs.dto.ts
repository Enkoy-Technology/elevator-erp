import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  MaxLength,
  IsString,
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
  type ProductType,
} from '../types';

/** Shown as it is: this box is typed by a salesperson, in metres. */
const TRAVEL_RANGE = 'Travel height is from 3 to 200 m, to two decimals.';
const SPEED_RANGE = 'Speed is from 0.05 to 10 m/s, to two decimals.';
const CAR_RANGE = 'Car size is a whole number from 500 to 10,000 mm.';

export class CalculateSpecsDto {
  @ApiProperty({
    example: 'PASSENGER',
    description: 'A code from GET /product-types.',
  })
  @IsString()
  @MaxLength(40)
  productType!: ProductType;

  // --- Standard-lift mode: a passenger lift is described by the shaft the
  // building has and the floors it serves; the table fills in the rest.
  @ApiPropertyOptional({
    minimum: 1000,
    maximum: 6000,
    example: 1835,
    description:
      'Shaft width, mm. With shaftDepthMm and floors, picks the standard passenger lift.',
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(10000)
  shaftWidthMm?: number;

  @ApiPropertyOptional({ minimum: 1000, maximum: 6000, example: 1750 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(10000)
  shaftDepthMm?: number;

  @ApiPropertyOptional({
    minimum: 2,
    maximum: 64,
    example: 12,
    description:
      'Floors served. Becomes the stop count; speed follows the floor bands.',
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(64)
  floors?: number;

  // --- Classic mode: every figure typed. Required unless the standard-lift
  // fields above describe the machine.
  @ApiPropertyOptional({ minimum: 320, maximum: 5000, example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(320)
  @Max(5000)
  capacityKg?: number;

  @ApiPropertyOptional({ minimum: 2, maximum: 64, example: 12 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(64)
  stops?: number;

  @ApiPropertyOptional({ minimum: 3, maximum: 200, example: 45 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(3)
  @Max(200)
  travelHeightM?: number;

  // Down to 0.05: a car stacking lift runs at 0.08–0.15 m/s (vehicle-specs.ts).
  @ApiPropertyOptional({ minimum: 0.05, maximum: 10, example: 1.6 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.05)
  @Max(10)
  speedMs?: number;

  @ApiPropertyOptional({
    enum: MACHINE_ROOM_TYPES,
    example: 'MRL',
    default: 'MRL',
  })
  @IsOptional()
  @IsEnum(MACHINE_ROOM_TYPES)
  machineRoomType?: MachineRoomType;

  @ApiPropertyOptional({ enum: DOOR_TYPES, example: 'CENTER_OPEN' })
  @IsOptional()
  @IsEnum(DOOR_TYPES)
  doorType?: DoorType;

  // Up to 4,000: a car lift's door opening is 2,600–2,800 mm (vehicle-specs.ts).
  @ApiPropertyOptional({ minimum: 700, maximum: 4000, example: 900 })
  @IsOptional()
  @IsInt()
  @Min(700)
  @Max(4000)
  doorWidthMm?: number;

  @ApiPropertyOptional({
    enum: BUILDING_USAGES,
    example: 'COMMERCIAL',
    default: 'COMMERCIAL',
  })
  @IsOptional()
  @IsEnum(BUILDING_USAGES)
  buildingUsage?: BuildingUsage;

  // --- Typed over what the calculator derives. Null clears one, which is
  // how a stored line goes back to the derived figure.
  @ApiPropertyOptional({
    minimum: 320,
    maximum: 5000,
    nullable: true,
    example: 800,
    description:
      "Standard passenger lift: the rated load to print in place of the table's. Not priced: the price stays the standard lift's. Ignored outside the table, whose load is capacityKg.",
  })
  @IsOptional()
  @IsInt()
  @Min(320)
  @Max(5000)
  capacityKgOverride?: number | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    nullable: true,
    example: 10,
    description:
      'The persons the specification prints, on any product with a rated load. Never priced.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  capacityPersonsOverride?: number | null;

  @ApiPropertyOptional({
    minimum: 3,
    maximum: 200,
    nullable: true,
    example: 42,
    description:
      'The travel the specification prints in place of 3.5 m × the floors. Never priced; a product priced on its rise sends travelHeightM instead.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: TRAVEL_RANGE })
  @Min(3, { message: TRAVEL_RANGE })
  @Max(200, { message: TRAVEL_RANGE })
  travelHeightMOverride?: number | null;

  @ApiPropertyOptional({
    minimum: 0.05,
    maximum: 10,
    nullable: true,
    example: 1.6,
    description:
      "Standard passenger lift: the speed to print in place of the table's. Never priced. Ignored outside the table, whose speed is speedMs.",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: SPEED_RANGE })
  @Min(0.05, { message: SPEED_RANGE })
  @Max(10, { message: SPEED_RANGE })
  speedMsOverride?: number | null;

  @ApiPropertyOptional({
    minimum: 500,
    maximum: 10000,
    nullable: true,
    example: 1350,
    description:
      "Standard passenger lift: the car width to print in place of the table's. Never priced. Where the table has no car, send it with carDepthMmOverride.",
  })
  @IsOptional()
  @IsInt({ message: CAR_RANGE })
  @Min(500, { message: CAR_RANGE })
  @Max(10000, { message: CAR_RANGE })
  carWidthMmOverride?: number | null;

  @ApiPropertyOptional({
    minimum: 500,
    maximum: 10000,
    nullable: true,
    example: 1400,
    description: 'As carWidthMmOverride, for the car depth.',
  })
  @IsOptional()
  @IsInt({ message: CAR_RANGE })
  @Min(500, { message: CAR_RANGE })
  @Max(10000, { message: CAR_RANGE })
  carDepthMmOverride?: number | null;

  @ApiPropertyOptional({
    minimum: 500,
    maximum: 10000,
    nullable: true,
    example: 2400,
    description: "The car height to print in place of the table's 2,400 mm.",
  })
  @IsOptional()
  @IsInt({ message: CAR_RANGE })
  @Min(500, { message: CAR_RANGE })
  @Max(10000, { message: CAR_RANGE })
  carHeightMmOverride?: number | null;

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
