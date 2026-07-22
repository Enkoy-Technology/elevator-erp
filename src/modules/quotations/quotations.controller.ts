import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { isUUID } from 'class-validator';

import { CurrentUser, Roles } from '../../common/decorators';
import { quoteStatusEnum, type QuoteStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { RejectQuotationDto } from './dto/reject-quotation.dto';
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

  @Post('quotations/:id/approve')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Approve a DRAFT quotation (Sales Manager+)' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.approve(user, id);
  }

  @Post('quotations/:id/reject')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Reject a DRAFT quotation with a reason' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectQuotationDto,
  ) {
    return this.quotationsService.reject(user, id, dto.reason);
  }

  @Post('quotations/:id/cancel')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Cancel a quotation (any non-terminal status)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.cancel(user, id);
  }

  @Post('quotations/:id/convert-proforma')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Convert an APPROVED quotation to a proforma' })
  convertToProforma(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.convertToProforma(user, id);
  }

  @Post('quotations/:id/convert-contract')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Convert a PROFORMA quotation to a contract' })
  convertToContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.convertToContract(user, id);
  }

  @Post('quotations/:id/generate-pdf')
  @Roles('SALES_MANAGER')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Render the branded quotation PDF (tenant branding)' })
  async generatePdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { filename, body } = await this.quotationsService.generatePdf(
      user,
      id,
    );
    // @Res() bypasses Nest's @Header/@HttpCode — set headers on the raw response.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(body);
  }
}
