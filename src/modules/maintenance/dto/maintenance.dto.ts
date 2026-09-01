import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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
}

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
