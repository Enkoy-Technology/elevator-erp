import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const ASSET_CATEGORIES = [
  'ELEVATOR',
  'ESCALATOR',
  'STAIRS',
  'OTHER',
] as const;
export const ASSET_STATUSES = [
  'ON_ORDER',
  'CHECKING',
  'IN_STORE',
  'AT_SITE',
  'ACTIVE',
  'INACTIVE',
  'DECOMMISSIONED',
] as const;
export const ASSET_STARTING_POINTS = ['FROM_FACTORY', 'INSTALLED'] as const;
export const ASSET_CHECKLIST_MARKS = ['OK', 'MISSING'] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetStartingPoint = (typeof ASSET_STARTING_POINTS)[number];
export type AssetChecklistMark = (typeof ASSET_CHECKLIST_MARKS)[number];

export class CreateAssetDto {
  @ApiPropertyOptional({
    enum: ASSET_STARTING_POINTS,
    description: 'Omitted means INSTALLED.',
  })
  @IsOptional()
  @IsEnum(ASSET_STARTING_POINTS)
  startingPoint?: AssetStartingPoint;

  @ApiPropertyOptional({
    description: 'False gives a lift from the factory no checklist, as for a car lift.',
  })
  @IsOptional()
  @IsBoolean()
  usePackingList?: boolean;

  @ApiPropertyOptional({
    example: ['1/2', '5/F3'],
    description: 'The parts that did not arrive, as case/item. Every other part starts ticked.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  missingParts?: string[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required on an installed lift, refused on one from the factory.',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ enum: ASSET_CATEGORIES, example: 'ELEVATOR' })
  @IsEnum(ASSET_CATEGORIES)
  category!: AssetCategory;

  @ApiProperty({ example: 'Lift A — Lobby' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Bole Plaza' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  buildingName?: string;

  @ApiPropertyOptional({ example: 'SN-2024-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({
    example: 'Brand: Sigma\nDrive: gearless traction\nCapacity: 630 kg\nStops: 12 (2B+G+9)\nSpeed: 1.5 m/s',
    description: 'One attribute per line; printed as the elevator specification on the maintenance agreement.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  specSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateAssetDto {
  @ApiPropertyOptional({ enum: ASSET_CATEGORIES })
  @IsOptional()
  @IsEnum(ASSET_CATEGORIES)
  category?: AssetCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  buildingName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  specSummary?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationNotes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class MoveAssetDto {
  @ApiProperty({ enum: ASSET_STATUSES })
  @IsEnum(ASSET_STATUSES)
  to!: AssetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CorrectAssetStatusDto {
  @ApiProperty({ enum: ASSET_STATUSES })
  @IsEnum(ASSET_STATUSES)
  to!: AssetStatus;

  @ApiProperty({ example: 'Pressed In service by mistake' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class SetSoldToDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  @ValidateIf((dto: SetSoldToDto) => dto.customerId !== null)
  @IsUUID()
  customerId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class UpdateChecklistItemDto {
  @ApiPropertyOptional({ enum: ASSET_CHECKLIST_MARKS })
  @ValidateIf((dto: UpdateChecklistItemDto) => dto.mark !== undefined)
  @IsEnum(ASSET_CHECKLIST_MARKS)
  mark?: AssetChecklistMark;

  @ApiPropertyOptional({ example: '4M=12, 2.5M=2', nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  quantity?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class MarkChecklistCaseDto {
  @ApiProperty({ enum: ASSET_CHECKLIST_MARKS })
  @IsIn(ASSET_CHECKLIST_MARKS)
  mark!: AssetChecklistMark;
}
