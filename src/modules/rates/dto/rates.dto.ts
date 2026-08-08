import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsObject, IsString, Matches, MaxLength } from 'class-validator';

import { rateKinds, type RateKind } from '../../../database/schema';

// Date-only shape (no time component — RatesRepository.rotate concatenates
// this straight into a 'T00:00:00Z' Date literal) plus real calendar
// validity (IsDateString rejects '2026-02-30'; the regex alone would not).
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateRateVersionDto {
  @ApiProperty({ enum: rateKinds })
  @IsIn(rateKinds)
  kind!: RateKind;

  @ApiProperty({ example: '2026-08-08', description: 'ISO date; must be strictly after the current open version’s validFrom' })
  @Matches(DATE_ONLY_RE)
  @IsDateString({ strict: true })
  validFrom!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiProperty({ example: 'VAT Proclamation 1341/2024', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  source!: string;
}
