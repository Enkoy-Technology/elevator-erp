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
  @Max(6000)
  shaftWidthMm?: number;

  @ApiPropertyOptional({ minimum: 1000, maximum: 6000, example: 1750 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(6000)
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

  @ApiPropertyOptional({ minimum: 0.4, maximum: 10, example: 1.6 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.4)
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

  @ApiPropertyOptional({ minimum: 700, maximum: 1400, example: 900 })
  @IsOptional()
  @IsInt()
  @Min(700)
  @Max(1400)
  doorWidthMm?: number;

  @ApiPropertyOptional({
    enum: BUILDING_USAGES,
    example: 'COMMERCIAL',
    default: 'COMMERCIAL',
  })
  @IsOptional()
  @IsEnum(BUILDING_USAGES)
  buildingUsage?: BuildingUsage;

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
