import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  isDateString,
  type ValidatorConstraintInterface,
} from 'class-validator';

export const LOCALES = ['en', 'am'] as const;
export type AppLocale = (typeof LOCALES)[number];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

// No date library needed: prefixing with a fixed non-leap year (2001) and
// delegating to class-validator's own isDateString(strict) rejects
// calendar-invalid MM-DD (e.g. '02-30', '04-31') with the day-of-month table
// class-validator already carries. Deliberately also rejects '02-29' — a
// leap-day fiscal year boundary is inherently ambiguous, so it is never
// valid regardless of which real year it's used in.
@ValidatorConstraint({ name: 'isValidFiscalYearBoundary', async: false })
class IsValidFiscalYearBoundaryConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    return typeof value === 'string' && isDateString(`2001-${value}`, { strict: true });
  }

  defaultMessage(): string {
    return 'fiscalYearStart must be a calendar-valid MM-DD';
  }
}

export class UpdateSettingsDto {
  // The company name on every branded document letterhead. Without this the
  // only way to name the tenant is the seeder, so a real deployment printed
  // quotations headed with whatever name it was provisioned under.
  @ApiPropertyOptional({ example: 'Shining Star Electromechanical Works' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'name must not be blank' })
  name?: string;

  // Printed under the company name on every branded document.
  @ApiPropertyOptional({ example: 'Star of Elevation' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slogan?: string;

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

  @ApiPropertyOptional({
    example: '07-08',
    description: 'MM-DD boundary of the tenant’s fiscal year',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/)
  @Validate(IsValidFiscalYearBoundaryConstraint)
  fiscalYearStart?: string;

  @ApiPropertyOptional({
    example: 3,
    description:
      'Days ahead of a maintenance contract’s next service date the daily reminder cron fires (task-2 §2.2).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  maintenanceReminderDays?: number;

  @ApiPropertyOptional({
    example: [0, 7, 30],
    description:
      'Days relative to an invoice’s dueDate the payment-reminder cron fires on — 0 is the due date itself, positive is days after (task-2 §2.3).',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(365, { each: true })
  paymentReminderOffsetDays?: number[];
}
