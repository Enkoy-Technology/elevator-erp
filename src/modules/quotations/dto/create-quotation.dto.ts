import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

// Reuse the calc engine's validated input shape — the quote is generated from
// the same spec the Phase 1 calculator prices. Server recomputes pricing; the
// client never sends money.
import { CalculateSpecsDto } from '../../elevator-calc/dto/calculate-specs.dto';

export class CreateQuotationDto extends CalculateSpecsDto {
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
