import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Recording the handover of a SIGNED contract. Every field here ends up
 * printed on the Completion Certificate, which is why `handedOverToName` is
 * required: a certificate that names nobody as having accepted the works
 * certifies nothing.
 */
export class HandoverContractDto {
  @ApiPropertyOptional({
    example: '2026-08-14',
    description:
      'Date the works were handed over (ISO date). Defaults to today in the business timezone.',
  })
  @IsOptional()
  // strict: true rejects calendar-invalid dates (e.g. 2026-02-30) with a
  // clean 400 instead of a raw Postgres 500 at insert time — same
  // convention as ConvertToProformaDto.validUntil.
  @IsISO8601({ strict: true })
  handedOverAt?: string;

  @ApiProperty({
    example: 'Abebe Kebede',
    description: "Who accepted the works on the customer's behalf.",
    maxLength: 200,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  handedOverToName!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  handoverNotes?: string;
}
