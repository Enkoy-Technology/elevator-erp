import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
} from 'class-validator';

import { IsEthiopianPhoneConstraint } from '../../../common/dto/phone';
import { CreateCustomerDto } from '../../customers/dto/create-customer.dto';
import { CreateProjectDto } from '../../projects/dto/create-project.dto';

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

  @ApiPropertyOptional({ example: 2000, description: 'Millimetres' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  shaftWidthMm?: number;

  @ApiPropertyOptional({ example: 1800, description: 'Millimetres' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  shaftDepthMm?: number;

  /** Free text, exactly as written on the sheet. Never parsed. */
  @ApiPropertyOptional({ example: 'B+G+11' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  floors?: string;

  @ApiPropertyOptional({ example: 4200, description: 'Overhead, millimetres' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  overheadMm?: number;

  /** The sheet's own words: 'With MR', 'MRL'. Free text, not an enum. */
  @ApiPropertyOptional({ example: 'With MR' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  machineRoom?: string;

  @ApiPropertyOptional({
    example: '2',
    description: 'A number or a word, as written on the form',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  units?: string;

  @ApiPropertyOptional({
    example: 'PASSENGER',
    description: 'A code from GET /product-types.',
  })
  @IsOptional()
  @Matches(/^[A-Z0-9_]{1,40}$/, {
    message: 'productType must be a product code such as PASSENGER',
  })
  productType?: string;

  /** The calculator's own bounds, so a converted sheet always calculates. */
  @ApiPropertyOptional({ minimum: 320, maximum: 5000, example: 630 })
  @IsOptional()
  @IsInt()
  @Min(320)
  @Max(5000)
  capacityKg?: number;
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

/** The project's own fields; the customer comes from the conversion. */
export class ConvertSiteSurveyProjectDto extends OmitType(CreateProjectDto, [
  'customerId',
] as const) {}

/**
 * Converting a sheet: the customer it belongs to, picked or new, and the
 * project it opens. Exactly one of `customerId` and `customer`.
 */
export class ConvertSiteSurveyDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'An existing customer. Omit to create `customer` instead.',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ type: () => CreateCustomerDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  customer?: CreateCustomerDto;

  @ApiProperty({ type: () => ConvertSiteSurveyProjectDto })
  // Without these, a missing or array-shaped project passes validation.
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ConvertSiteSurveyProjectDto)
  project!: ConvertSiteSurveyProjectDto;
}
