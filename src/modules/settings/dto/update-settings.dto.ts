import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const LOCALES = ['en', 'am'] as const;
export type AppLocale = (typeof LOCALES)[number];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: '#1B2A4A' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR)
  primaryColorHex?: string;

  @ApiPropertyOptional({ example: '#E8B54D' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR)
  secondaryColorHex?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  stampUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  officialAddress?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string | null;

  @ApiPropertyOptional({ enum: LOCALES, example: 'en' })
  @IsOptional()
  @IsIn(LOCALES)
  defaultLocale?: AppLocale;

  // Regex is deliberately calendar-naive (accepts '02-30'): a day-of-month
  // check is not worth a date library for a value admins set once. See
  // task-1.3-brief.md.
  @ApiPropertyOptional({
    example: '07-08',
    description: 'MM-DD boundary of the tenant’s fiscal year',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/)
  fiscalYearStart?: string;
}
