import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const NOTIFICATION_TYPES = [
  'GENERAL',
  'QUOTE',
  'ASSIGNMENT',
  'MAINTENANCE',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export class CreateNotificationDto {
  @ApiProperty({ format: 'uuid', description: 'Recipient user id' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES, default: 'GENERAL' })
  @IsOptional()
  @IsEnum(NOTIFICATION_TYPES)
  type?: NotificationType;

  @ApiProperty({ example: 'You were assigned to a project' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({
    example: '/projects',
    description: 'Optional in-app path',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  linkPath?: string;
}
