import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ConvertToProformaDto {
  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Date the proforma pricing stays valid until (ISO date).',
  })
  @IsOptional()
  // strict: true rejects calendar-invalid dates (e.g. 2026-02-30), matching
  // CreateQuotationDto.validUntil's convention — without it, a bad date
  // would only fail at insert time as a raw Postgres error (500), not a
  // clean 400.
  @IsISO8601({ strict: true })
  validUntil?: string;
}
