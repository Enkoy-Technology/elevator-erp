import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';

import { MONEY_RE, PositiveMoneyConstraint } from '../../../common/dto/money';

const MONEY_MSG = 'must be a non-negative decimal string with up to 2 decimals';

export class CreateProductTypeDto {
  @ApiProperty({ example: 'Panoramic elevator', maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: '8000000.00', description: 'Starting price, ETB, before margin and VAT.' })
  @Matches(MONEY_RE, { message: `basePriceEtb ${MONEY_MSG}` })
  @Validate(PositiveMoneyConstraint)
  basePriceEtb!: string;

  @ApiPropertyOptional({ example: '80000.00', description: 'Added per stop above 10. 0 for a flat price.', default: '0' })
  @IsOptional()
  @Matches(MONEY_RE, { message: `perStopEtb ${MONEY_MSG}` })
  perStopEtb?: string;

  @ApiPropertyOptional({ example: '1000.00', description: 'Added per kg above 630. 0 for a flat price.', default: '0' })
  @IsOptional()
  @Matches(MONEY_RE, { message: `perKgEtb ${MONEY_MSG}` })
  perKgEtb?: string;

  @ApiPropertyOptional({ default: true, description: 'Compute the EN 81 lift geometry (car, shaft, pit). Off for escalators.' })
  @IsOptional()
  @IsBoolean()
  liftGeometry?: boolean;
}

export class UpdateProductTypeDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY_RE, { message: `basePriceEtb ${MONEY_MSG}` })
  @Validate(PositiveMoneyConstraint)
  basePriceEtb?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY_RE, { message: `perStopEtb ${MONEY_MSG}` })
  perStopEtb?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY_RE, { message: `perKgEtb ${MONEY_MSG}` })
  perKgEtb?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  liftGeometry?: boolean;
}
