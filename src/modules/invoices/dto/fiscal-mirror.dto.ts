import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Manual mirror of the customer's ETR/certified-fiscal-device receipt — see
 * invoices.ts's table doc comment and
 * docs/planning/DECISIONS-platform-and-ethiopian-compliance.md §4. These
 * five columns are the ONLY thing this endpoint can touch (whitelisted by
 * this DTO — every other invoice field is append-only or has its own
 * dedicated transition).
 */
export class FiscalMirrorDto {
  @ApiPropertyOptional({ example: 'ETR-000123456' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fiscalReceiptNumber?: string;

  @ApiPropertyOptional({ example: 'SN-9988776655' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fiscalDeviceSerial?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-30T14:05:00Z' })
  @IsOptional()
  @IsISO8601()
  fiscalIssuedAt?: string;

  @ApiPropertyOptional({ example: 'Z-report' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fiscalKind?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fiscalNote?: string;
}
