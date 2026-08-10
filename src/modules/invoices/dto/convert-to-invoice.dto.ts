import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ConvertToInvoiceDto {
  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Payment due date (ISO date).',
  })
  @IsOptional()
  // strict: true rejects calendar-invalid dates (e.g. 2026-02-30) — same
  // convention as ConvertToProformaDto.validUntil.
  @IsISO8601({ strict: true })
  dueDate?: string;
}
