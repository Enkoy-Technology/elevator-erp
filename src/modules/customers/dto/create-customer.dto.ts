import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';

import { IsEthiopianPhoneConstraint } from '../../../common/dto/phone';

export const CUSTOMER_TYPES = [
  'RESIDENTIAL',
  'COMMERCIAL',
  'GOVERNMENT',
] as const;

export class CreateCustomerDto {
  @ApiProperty({ example: 'Addis Heights PLC' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional({ example: 'ops@addisheights.et' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+251949922604' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  // Validated at the point it's WRITTEN (phase-5 review I4) — this is the
  // same phone column the maintenance/payment reminder crons read
  // (customers.phone), so a malformed value stored here is a reminder that
  // silently never arrives, forever, with only a masked ERROR log line to
  // show for it.
  @Validate(IsEthiopianPhoneConstraint)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  alternatePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Addis Ababa' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ example: 'ET' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  buildingName?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_TYPES, example: 'COMMERCIAL' })
  @IsOptional()
  @IsEnum(CUSTOMER_TYPES)
  customerType?: (typeof CUSTOMER_TYPES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Set true once the customer has given recorded consent to receive SMS (ECA Directive 832/2021). Set false to revoke. The server stamps the current time — never a client-supplied timestamp.',
  })
  @IsOptional()
  @IsBoolean()
  smsConsentGiven?: boolean;
}
