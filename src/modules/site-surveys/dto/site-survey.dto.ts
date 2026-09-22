import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
} from 'class-validator';

import { IsEthiopianPhoneConstraint } from '../../../common/dto/phone';

// Same date-only shape as CreateRateVersionDto: the regex pins the format,
// IsDateString({strict:true}) rejects '2026-02-30'.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The client's SITE COLLECTION FORM, column for column. Everything but the
 * project name is optional because the real sheets come back mostly blank —
 * a salesperson standing in a stairwell measures what they can. Rejecting a
 * half-filled sheet would send them straight back to Telegram.
 */
export class CreateSiteSurveyDto {
  @ApiProperty({ example: 'Bole Plaza', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  projectName!: string;

  @ApiPropertyOptional({
    example: '2026-09-22',
    description: 'ISO date; defaults to today in the business timezone',
  })
  @IsOptional()
  @Matches(DATE_ONLY_RE)
  @IsDateString({ strict: true })
  surveyDate?: string;

  @ApiPropertyOptional({ example: 'Bole, behind Friendship' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ example: 'Ato Abebe' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @ApiPropertyOptional({ example: '0911234567' })
  @IsOptional()
  @IsString()
  @Validate(IsEthiopianPhoneConstraint)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 200, description: 'Centimetres' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  shaftWidthCm?: number;

  @ApiPropertyOptional({ example: 180, description: 'Centimetres' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  shaftDepthCm?: number;

  /** Free text, exactly as written on the sheet. Never parsed. */
  @ApiPropertyOptional({ example: 'B+G+11' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  floors?: string;

  @ApiPropertyOptional({ example: 420, description: 'Overhead, centimetres' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  overheadCm?: number;

  /** The sheet's own words: 'With MR', 'MRL'. Free text, not an enum. */
  @ApiPropertyOptional({ example: 'With MR' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  machineRoom?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  units?: number;
}

/**
 * Every field optional: the salesperson corrects one measurement at a time.
 * An absent key leaves the column alone; an explicit null clears a nullable
 * one (`@IsOptional()` lets null through untouched).
 */
export class UpdateSiteSurveyDto extends PartialType(CreateSiteSurveyDto) {}

/**
 * What a PATCH body can actually carry: `@IsOptional()` lets an explicit null
 * through untouched, and null is how the UI clears a nullable column, so the
 * type says so even though PartialType's own shape stops at `| undefined`.
 */
export type SiteSurveyPatch = {
  [K in keyof UpdateSiteSurveyDto]?: UpdateSiteSurveyDto[K] | null;
};
