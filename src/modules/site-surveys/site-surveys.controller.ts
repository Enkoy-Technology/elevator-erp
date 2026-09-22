import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CreateSiteSurveyDto } from './dto/site-survey.dto';
import { SiteSurveysService } from './site-surveys.service';

/**
 * The company's SITE COLLECTION FORM, captured in the ERP instead of sent to
 * the manager over Telegram. Deliberately standalone (client, 2026-09-22):
 * nothing here touches quotations, projects, customers or the calculator.
 */
@ApiTags('site-surveys')
@ApiBearerAuth('access-token')
@Controller('site-surveys')
@Roles(
  'SALESPERSON',
  'SALES_MANAGER',
  'GENERAL_MANAGER',
  'TECHNICAL_MANAGER',
  'OFFICE_MANAGER',
  'SECRETARY',
)
export class SiteSurveysController {
  constructor(private readonly siteSurveysService: SiteSurveysService) {}

  @Get()
  @ApiOperation({
    summary:
      'List site surveys, newest first. A salesperson sees only their own.',
  })
  @ApiOkResponse({ description: 'Paginated site survey list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.siteSurveysService.list(user, { page, pageSize });
  }

  @Post()
  @ApiOperation({ summary: 'Submit a site collection form' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSiteSurveyDto,
  ) {
    return this.siteSurveysService.create(user, dto);
  }
}
