import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MONEY_RE } from '../../../common/dto/money';

/** One row of the schedule the offer states: "50% on signing". */
export class PaymentTermDto {
  @ApiProperty({
    maxLength: 300,
    example: 'Payable upon submission of shipping documents',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  label!: string;

  @ApiProperty({ example: '50.00', description: 'Percent of the quoted price.' })
  @Matches(MONEY_RE, {
    message: 'percent must be a number with up to 2 decimal places',
  })
  percent!: string;

  @ApiPropertyOptional({ maxLength: 40, example: 'SHIPPING_DOCUMENTS' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  triggerEvent?: string;
}

/**
 * The commercial prose on page 1. Every field is optional and only the
 * fields PRESENT in the body are written — sending `{ deliveryDays: 120 }`
 * must not blank the warranty someone else set.
 */
export class UpdateQuotationTermsDto {
  @ApiPropertyOptional({ maxLength: 60, example: 'Rodas FUJIHD-E02' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  referenceCode?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 3650, example: 150 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  deliveryDays?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 600, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  warrantyPartsMonths?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 600, example: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  warrantyFreeServiceMonths?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 3650, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  validityDays?: number;

  /**
   * Replaces the whole schedule when present. An empty array clears it; the
   * percentages must total exactly 100 (see paymentTermsMismatchReason).
   */
  @ApiPropertyOptional({ type: [PaymentTermDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PaymentTermDto)
  paymentTerms?: PaymentTermDto[];
}
