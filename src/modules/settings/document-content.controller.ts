import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import { toPaginatedResult } from '../../common/pagination';
import type { AuthenticatedUser } from '../../types/auth.types';
import { DocumentContentService } from './document-content.service';
import {
  CreateBoilerplateSectionDto,
  CreateComponentSpecificationDto,
  ReorderDto,
  UpdateBoilerplateSectionDto,
  UpdateComponentSpecificationDto,
} from './dto/document-content.dto';

/**
 * Both lists are short and ordered, and every caller wants the whole thing —
 * the admin screen renders a reorderable table, the PDF renders every row —
 * so these return the house `{ items, page, pageSize, total, totalPages }`
 * envelope over the complete set rather than a real page. Reordering a list
 * you can only see 10 rows of is a bug generator, not a feature.
 */
const wholeList = <T>(items: T[]) =>
  toPaginatedResult(items, items.length, 1, Math.max(items.length, 1));

/**
 * Reading is open to the roles that read quotations — a technical lead
 * checking which brands a quote will print needs it as much as sales does.
 * Writing is SALES_MANAGER; CEO and ADMIN pass everywhere via RolesGuard's
 * SUPER_ROLES, so they are deliberately not listed.
 */
@ApiTags('settings')
@ApiBearerAuth('access-token')
@Controller('settings')
@Roles('GENERAL_MANAGER', 'SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE')
export class DocumentContentController {
  constructor(private readonly documentContent: DocumentContentService) {}

  // ---------------------------------------------------------------- sections

  @Get('boilerplate')
  @ApiOperation({ summary: 'List document boilerplate sections in print order' })
  @ApiOkResponse({ description: 'Every section, active and inactive' })
  async listBoilerplate(@CurrentUser() user: AuthenticatedUser) {
    return wholeList(await this.documentContent.listBoilerplate(user));
  }

  @Post('boilerplate')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({ summary: 'Add a boilerplate section' })
  createBoilerplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBoilerplateSectionDto,
  ) {
    return this.documentContent.createBoilerplate(user, dto);
  }

  @Patch('boilerplate/:id')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({ summary: 'Edit a boilerplate section title, body or order' })
  updateBoilerplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoilerplateSectionDto,
  ) {
    return this.documentContent.updateBoilerplate(user, id, dto);
  }

  @Post('boilerplate/reorder')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set the print order of every boilerplate section' })
  async reorderBoilerplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderDto,
  ) {
    return wholeList(await this.documentContent.reorderBoilerplate(user, dto));
  }

  @Post('boilerplate/:id/deactivate')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Stop printing a section without losing its text',
  })
  deactivateBoilerplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentContent.deactivateBoilerplate(user, id);
  }

  // -------------------------------------------------------------- components

  @Get('components')
  @ApiOperation({ summary: 'List the component/brand table in print order' })
  async listComponents(@CurrentUser() user: AuthenticatedUser) {
    return wholeList(await this.documentContent.listComponents(user));
  }

  @Post('components')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({ summary: 'Add a component/brand row' })
  createComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateComponentSpecificationDto,
  ) {
    return this.documentContent.createComponent(user, dto);
  }

  @Patch('components/:id')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({ summary: 'Edit a component/brand row' })
  updateComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComponentSpecificationDto,
  ) {
    return this.documentContent.updateComponent(user, id, dto);
  }

  @Post('components/reorder')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set the print order of every component row' })
  async reorderComponents(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderDto,
  ) {
    return wholeList(await this.documentContent.reorderComponents(user, dto));
  }

  /**
   * Deleted, not deactivated: the table has no is_active column, and 0064
   * grants DELETE here on purpose. Issued documents keep their own snapshot.
   */
  @Delete('components/:id')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Component row removed' })
  @ApiOperation({ summary: 'Remove a component/brand row' })
  deleteComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentContent.deleteComponent(user, id);
  }
}
