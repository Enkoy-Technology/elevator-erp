import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, Matches } from 'class-validator';

import { projectStatusEnum } from '../../../database/schema/enums';

export const PROJECT_STATUSES = projectStatusEnum.enumValues;

/** Positive ETB amount with up to 2 decimals, as a string (never a float). */
const ETB_AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

export class UpdateProjectStatusDto {
  @ApiProperty({ enum: PROJECT_STATUSES, example: 'SITE_SURVEY' })
  @IsEnum(PROJECT_STATUSES)
  status!: (typeof PROJECT_STATUSES)[number];

  @ApiPropertyOptional({
    example: '172345.21',
    description: 'Price offered to the customer. Set it when moving to QUOTATION.',
  })
  @IsOptional()
  @Matches(ETB_AMOUNT, {
    message: 'quotedAmountEtb must be a positive amount with up to 2 decimals',
  })
  quotedAmountEtb?: string;

  @ApiPropertyOptional({
    example: '165000.00',
    description: 'Signed contract value. Set it when moving to CONTRACT.',
  })
  @IsOptional()
  @Matches(ETB_AMOUNT, {
    message: 'contractAmountEtb must be a positive amount with up to 2 decimals',
  })
  contractAmountEtb?: string;
}
