import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const ASSET_CATEGORIES = [
  'ELEVATOR',
  'ESCALATOR',
  'STAIRS',
  'OTHER',
] as const;
export const ASSET_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'DECOMMISSIONED',
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export class CreateAssetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

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
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

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
  @MaxLength(500)
  locationNotes?: string | null;

  @ApiPropertyOptional({ enum: ASSET_STATUSES })
  @IsOptional()
  @IsEnum(ASSET_STATUSES)
  status?: AssetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
