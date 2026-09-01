import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Signing is the one transition with a date the parties choose: the wet
 * signatures may land days after someone gets round to recording them.
 */
export class SignContractDto {
  @ApiPropertyOptional({
    example: '2026-08-14',
    description:
      'The date the parties signed (ISO date). Defaults to today in the business timezone.',
  })
  @IsOptional()
  // strict: true rejects calendar-invalid dates (2026-02-30) with a clean
  // 400 instead of a raw Postgres 500 — same convention as
  // HandoverContractDto.handedOverAt.
  @IsISO8601({ strict: true })
  signedAt?: string;
}
