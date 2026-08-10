import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

import { CalculateSpecsDto } from '../../elevator-calc/dto/calculate-specs.dto';

// Reuse the calc engine's validated input shape — the quote is generated from
// the same spec the calculator prices. Server recomputes pricing; the client
// never sends money. taxPercent is omitted: VAT is resolved server-side from
// the rates table (RatesService.resolve('VAT', ...)), never taken from the
// caller — see QuotationsService.createForProject.
export class CreateQuotationDto extends OmitType(CalculateSpecsDto, [
  'taxPercent',
] as const) {
  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-30T00:00:00Z' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
