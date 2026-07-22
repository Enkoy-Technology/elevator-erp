import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';

import { CurrentUser, Roles } from '../../common/decorators';
import { quoteStatusEnum, type QuoteStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { QuotationsService } from './quotations.service';

const QUOTE_STATUSES = quoteStatusEnum.enumValues;

@ApiTags('quotations')
@ApiBearerAuth('access-token')
@Controller()
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get('quotations')
  @ApiOperation({ summary: 'List quotations (project/status filter + paging)' })
  @ApiOkResponse({ description: 'Paginated quotation list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (projectId !== undefined && !isUUID(projectId)) {
      throw new BadRequestException('projectId must be a UUID');
    }
    if (
      status !== undefined &&
      !(QUOTE_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${QUOTE_STATUSES.join(', ')}`,
      );
    }
    return this.quotationsService.list(user, {
      projectId,
      status: status as QuoteStatus | undefined,
      page,
      pageSize,
    });
  }

  @Get('quotations/:id')
  @ApiOperation({ summary: 'Get quotation by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.getById(user, id);
  }

  @Post('projects/:projectId/quotations')
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Generate a DRAFT quotation from calc for a project' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotationsService.createForProject(user, projectId, dto);
  }
}
