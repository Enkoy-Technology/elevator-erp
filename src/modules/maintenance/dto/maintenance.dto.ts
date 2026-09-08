import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
} from 'class-validator';

import { MONEY_RE, PositiveMoneyConstraint } from '../../../common/dto/money';

/**
 * `CUSTOM` was removed in migration 0020: there was no interval column to
 * drive it, so those contracts never advanced their next service date. Add it
 * back together with a `custom_interval_days` column if a client asks.
 */
export const MAINTENANCE_RECURRENCES = [
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'BIANNUAL',
  'ANNUAL',
] as const;

export const MAINTENANCE_CONTRACT_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'ENDED',
] as const;

export const BREAKDOWN_SEVERITIES = [
  'EMERGENCY',
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
] as const;

export const BREAKDOWN_STATUSES = ['OPEN', 'ASSIGNED', 'DONE'] as const;

export type MaintenanceRecurrence = (typeof MAINTENANCE_RECURRENCES)[number];
export type MaintenanceContractStatus =
  (typeof MAINTENANCE_CONTRACT_STATUSES)[number];
export type BreakdownSeverity = (typeof BREAKDOWN_SEVERITIES)[number];
export type BreakdownStatus = (typeof BREAKDOWN_STATUSES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateMaintenanceContractDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assetId!: string;

  @ApiPropertyOptional({
    enum: MAINTENANCE_RECURRENCES,
    default: 'MONTHLY',
  })
  @IsOptional()
  @IsEnum(MAINTENANCE_RECURRENCES)
  recurrence?: MaintenanceRecurrence;

  @ApiProperty({ example: '2026-07-22' })
  @IsString()
  @Matches(DATE_RE)
  startDate!: string;

  @ApiProperty({ example: '2026-08-22' })
  @IsString()
  @Matches(DATE_RE)
  nextServiceAt!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // The commercial terms printed on the Maintenance & Service Agreement.

  @ApiPropertyOptional({ example: '6900.00', description: 'Fixed monthly fee, ETB.' })
  @IsOptional()
  @Matches(MONEY_RE, { message: 'monthlyFeeEtb must be a non-negative decimal string with up to 2 decimals' })
  @Validate(PositiveMoneyConstraint)
  monthlyFeeEtb?: string;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  feeIncludesVat?: boolean;

  @ApiPropertyOptional({ default: 12, description: 'Initial term, months.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(120)
  termMonths?: number;

  @ApiPropertyOptional({ default: true, description: 'Renews for successive terms unless notice is given.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  autoRenews?: boolean;

  @ApiPropertyOptional({ default: 30, description: 'Written notice before the term ends, days.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  noticeDays?: number;

  @ApiPropertyOptional({ default: 7, description: 'Days to cure a material breach before termination for cause.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  cureDays?: number;

  @ApiPropertyOptional({ description: 'Overrides the standard scope of work printed on the agreement.' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  scopeOfWork?: string;
}

/**
 * The clauses printed on the agreement are NOT NULL columns, so `null`
 * must fail validation (`@ValidateIf` rather than `@IsOptional`, which
 * skips every validator on null); absent leaves the column alone.
 */
export class UpdateMaintenanceContractDto {
  @ApiPropertyOptional({ enum: MAINTENANCE_RECURRENCES })
  @IsOptional()
  @IsEnum(MAINTENANCE_RECURRENCES)
  recurrence?: MaintenanceRecurrence;

  @ApiPropertyOptional({ enum: MAINTENANCE_CONTRACT_STATUSES })
  @IsOptional()
  @IsEnum(MAINTENANCE_CONTRACT_STATUSES)
  status?: MaintenanceContractStatus;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsString()
  @Matches(DATE_RE)
  nextServiceAt?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ example: '6900.00', nullable: true })
  @IsOptional()
  @Matches(MONEY_RE, { message: 'monthlyFeeEtb must be a non-negative decimal string with up to 2 decimals' })
  @Validate(PositiveMoneyConstraint)
  monthlyFeeEtb?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  feeIncludesVat?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(120)
  termMonths?: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  autoRenews?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  noticeDays?: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  cureDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  scopeOfWork?: string | null;
}

/**
 * `notes` stays the free-text catch-all it has always been — the three
 * fields below are an ADDITION (the client's own Maintenance Form asks for
 * them separately, and the report document prints them as labelled blocks).
 * Visits logged before they existed keep their notes.
 */
export class LogServiceVisitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 'Door operator within tolerance.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  inspectionResults?: string;

  @ApiPropertyOptional({ example: 'Door roller x2' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  partsReplaced?: string;

  @ApiPropertyOptional({ example: 'Replace landing door guide shoes next visit.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  recommendations?: string;
}

export class CreateBreakdownDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assetId!: string;

  @ApiProperty({ example: 'Door not closing' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: BREAKDOWN_SEVERITIES, default: 'MEDIUM' })
  @IsOptional()
  @IsEnum(BREAKDOWN_SEVERITIES)
  severity?: BreakdownSeverity;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}

export class UpdateBreakdownDto {
  @ApiPropertyOptional({ enum: BREAKDOWN_SEVERITIES })
  @IsOptional()
  @IsEnum(BREAKDOWN_SEVERITIES)
  severity?: BreakdownSeverity;

  @ApiPropertyOptional({ enum: BREAKDOWN_STATUSES })
  @IsOptional()
  @IsEnum(BREAKDOWN_STATUSES)
  status?: BreakdownStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
