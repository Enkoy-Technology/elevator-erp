import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { projectStatusEnum } from '../../../database/schema/enums';

export const PROJECT_STATUSES = projectStatusEnum.enumValues;

export class UpdateProjectStatusDto {
  @ApiProperty({ enum: PROJECT_STATUSES, example: 'SITE_SURVEY' })
  @IsEnum(PROJECT_STATUSES)
  status!: (typeof PROJECT_STATUSES)[number];
}
