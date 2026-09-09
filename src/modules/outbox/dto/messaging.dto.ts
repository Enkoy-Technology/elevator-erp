import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { USER_ROLES, type UserRole } from '../../../types/auth.types';

/** GeezSMS caps one message at 335 characters; a greeting fits in far less. */
const MAX_BODY = 335;

export class CreateMessageTemplateDto {
  @ApiProperty({ example: 'Ethiopian New Year greeting', maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'Dear {{name}}, Melkam Addis Amet! Happy Ethiopian New Year from {{company}}.',
    description: 'May contain {{name}} and {{company}}, filled per recipient.',
    maxLength: MAX_BODY,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_BODY)
  body!: string;
}

export class UpdateMessageTemplateDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: MAX_BODY })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_BODY)
  body?: string;
}

export const BROADCAST_AUDIENCES = ['EMPLOYEES', 'CUSTOMERS'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

/** Staff roles a broadcast can be narrowed to — every seat but the customer portal. */
export const BROADCAST_ROLES = USER_ROLES.filter((r) => r !== 'CUSTOMER');

/**
 * One message to many people. The same shape previews (counts only) and
 * sends; `sendAt` in the future queues the messages to go out then, so a
 * New Year greeting can be written the week before.
 */
export class BroadcastDto {
  @ApiProperty({ enum: BROADCAST_AUDIENCES, example: 'EMPLOYEES' })
  @IsEnum(BROADCAST_AUDIENCES)
  audience!: BroadcastAudience;

  @ApiPropertyOptional({
    description: 'EMPLOYEES only: limit to these roles. Omit for every active employee.',
    example: ['MAINTENANCE_ENGINEER', 'TECHNICAL_MANAGER'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(BROADCAST_ROLES, { each: true })
  roles?: UserRole[];

  @ApiProperty({
    example: 'Dear {{name}}, Melkam Gena! Merry Ethiopian Christmas from {{company}}.',
    maxLength: MAX_BODY,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_BODY)
  body!: string;

  @ApiPropertyOptional({
    example: '2027-01-07T06:00:00+03:00',
    description: 'When to send (ISO 8601). Omit to send now.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  sendAt?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The saved template this was written from, for the record. Optional.',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string;
}
