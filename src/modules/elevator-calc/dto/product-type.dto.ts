import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';

import { MONEY_RE, PositiveMoneyConstraint } from '../../../common/dto/money';
import { MAX_FORMULA_LENGTH } from '../../../common/formula';
import { IsPricingFormulaConstraint } from '../../settings/dto/update-settings.dto';

const MONEY_MSG = 'must be a non-negative decimal string with up to 2 decimals';

export class CreateProductTypeDto {
  @ApiProperty({ example: 'Panoramic elevator', maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({
    example: '8000000.00',
    description: 'Starting price, ETB, before margin and VAT.',
  })
  @Matches(MONEY_RE, { message: `basePriceEtb ${MONEY_MSG}` })
  @Validate(PositiveMoneyConstraint)
  basePriceEtb!: string;

  @ApiPropertyOptional({
    example: '80000.00',
    description: 'Added per stop above refStops. 0 for a flat price.',
    default: '0',
  })
  @IsOptional()
  @Matches(MONEY_RE, { message: `perStopEtb ${MONEY_MSG}` })
  perStopEtb?: string;

  @ApiPropertyOptional({
    example: '1000.00',
    description:
      'Added per kgStep kilograms above refCapacityKg. 0 for a flat price.',
    default: '0',
  })
  @IsOptional()
  @Matches(MONEY_RE, { message: `perKgEtb ${MONEY_MSG}` })
  perKgEtb?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Compute the EN 81 lift geometry (car, shaft, pit). Off for escalators.',
  })
  @IsOptional()
  @IsBoolean()
  liftGeometry?: boolean;

  @ApiPropertyOptional({
    default: 10,
    description: 'The stops the base price includes (refN in the formula).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(64)
  refStops?: number;

  @ApiPropertyOptional({
    default: 630,
    description:
      'The capacity the base price includes, kg (refC in the formula).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  refCapacityKg?: number;

  @ApiPropertyOptional({
    example: 100,
    default: 1,
    description:
      'Kilograms one perKgEtb step covers — the sheet prices passenger lifts per 100 kg and car / goods lifts per 1,000 kg (kgStep in the formula).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  kgStep?: number;

  @ApiPropertyOptional({
    example: 3500,
    nullable: true,
    description:
      'The smallest rated load this product is sold at, kg — the calculator refuses less. Null for no floor.',
  })
  @ValidateIf(
    (o: { minCapacityKg?: number | null }) => o.minCapacityKg !== null,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  minCapacityKg?: number | null;

  @ApiPropertyOptional({
    example: 'Base price + (rise - 6) * 500,000',
    description:
      'This product’s own formula. Omit or null to use the company formula under Settings. Same names: base, N, C, rise, refN, refC, perStop, perKg.',
    nullable: true,
  })
  @ValidateIf((o: { formula?: string | null }) => o.formula !== null)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FORMULA_LENGTH)
  @Validate(IsPricingFormulaConstraint)
  formula?: string | null;
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

  @ApiPropertyOptional({
    default: 10,
    description: 'The stops the base price includes (refN in the formula).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(64)
  refStops?: number;

  @ApiPropertyOptional({
    default: 630,
    description:
      'The capacity the base price includes, kg (refC in the formula).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  refCapacityKg?: number;

  @ApiPropertyOptional({
    example: 100,
    default: 1,
    description:
      'Kilograms one perKgEtb step covers — the sheet prices passenger lifts per 100 kg and car / goods lifts per 1,000 kg (kgStep in the formula).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  kgStep?: number;

  @ApiPropertyOptional({
    example: 3500,
    nullable: true,
    description:
      'The smallest rated load this product is sold at, kg — the calculator refuses less. Null for no floor.',
  })
  @ValidateIf(
    (o: { minCapacityKg?: number | null }) => o.minCapacityKg !== null,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  minCapacityKg?: number | null;

  @ApiPropertyOptional({
    example: 'Base price + (rise - 6) * 500,000',
    description:
      'This product’s own formula. Omit or null to use the company formula under Settings. Same names: base, N, C, rise, refN, refC, perStop, perKg.',
    nullable: true,
  })
  @ValidateIf((o: { formula?: string | null }) => o.formula !== null)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FORMULA_LENGTH)
  @Validate(IsPricingFormulaConstraint)
  formula?: string | null;
}
