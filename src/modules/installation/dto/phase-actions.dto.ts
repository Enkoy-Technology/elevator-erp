import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AssignPhaseCrewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  crewId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadEngineerUserId?: string;
}

export class UpdateChecklistItemDto {
  @ApiProperty()
  @IsBoolean()
  completed!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  photoUrl?: string;
}

export class PhaseSignOffDto {
  @ApiProperty({ example: 'Abebe Kebede' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  signOffName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  signatureUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  stampUrl?: string;
}
