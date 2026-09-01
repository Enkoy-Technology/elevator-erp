import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CalculateSpecsDto } from '../../elevator-calc/dto/calculate-specs.dto';

/**
 * One lift on page 1's line table. Reuses the calculator's validated input
 * shape exactly as CreateQuotationDto does — each line is priced by its own
 * calculator run.
 *
 * `taxPercent` is omitted for the same reason as there: VAT is resolved
 * server-side. `stops` is omitted from the required set and re-declared
 * optional below because `floorLabels` derives it (see quote-spec.ts) — one
 * of the two must be supplied, which the service enforces.
 */
export class CreateQuotationLineDto extends OmitType(CalculateSpecsDto, [
  'taxPercent',
  'stops',
] as const) {
  @ApiPropertyOptional({
    minimum: 2,
    maximum: 64,
    description: 'Required only when floorLabels is not supplied.',
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(64)
  stops?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 999, default: 1, example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @ApiPropertyOptional({
    maxLength: 300,
    description:
      'Page-1 description cell. Derived from the spec fields when omitted.',
    example: '800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  specSummary?: string;

  // --- Page 2's specification table. Display only: none of these feed the
  // frozen pricing formula. `floorLabels` is the exception in one direction
  // only — its COUNT fills calcInput.stops, which pricing already used.
  @ApiPropertyOptional({ maxLength: 40, example: 'WITH MR' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  machineRoomLabel?: string;

  @ApiPropertyOptional({ maxLength: 500, example: 'B,G,M,1,2,3,4,5,6,7,8,9,10' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  floorLabels?: string;

  @ApiPropertyOptional({
    maxLength: 60,
    example: 'B+G+M+10',
    description: 'Derived from floorLabels when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  floorDisplaySummary?: string;

  @ApiPropertyOptional({ minimum: 1800, maximum: 3000, example: 2100 })
  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(3000)
  doorHeightMm?: number;

  @ApiPropertyOptional({ maxLength: 20, example: '2:1' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ropingRatio?: string;

  @ApiPropertyOptional({ maxLength: 80, example: 'Gearless permanent magnet' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tractionMachineType?: string;

  @ApiPropertyOptional({ maxLength: 40, example: 'Simplex' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  controlSystem?: string;

  @ApiPropertyOptional({ maxLength: 80, example: '380V AC 50HZ 3-phase 4 lines' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  powerSupply?: string;

  @ApiPropertyOptional({ maxLength: 80, example: '240V AC 50HZ Single phase' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lightSupply?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 4, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  entranceCount?: number;
}

/**
 * Every field optional: the patch is merged onto the line's stored
 * `calcInput` and the calculator is re-run off the merged result, so a
 * one-field edit never has to restate the whole spec.
 */
export class UpdateQuotationLineDto extends PartialType(
  CreateQuotationLineDto,
) {}

export class ReorderQuotationLinesDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Every line id of the quotation, in the print order they should take.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  lineIds!: string[];
}
