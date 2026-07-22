import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CREW_TYPES = [
  'INSTALLATION',
  'MAINTENANCE',
  'EMERGENCY',
] as const;

export class CreateCrewDto {
  @ApiProperty({ example: 'Install Crew A' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: CREW_TYPES, example: 'INSTALLATION' })
  @IsOptional()
  @IsEnum(CREW_TYPES)
  crewType?: (typeof CREW_TYPES)[number];
}

export class AddCrewMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isLead?: boolean;
}
