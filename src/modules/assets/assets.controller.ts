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
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { type ColumnDef, writeCsv, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { AssetsService } from './assets.service';
import {
  ASSET_CATEGORIES,
  CreateAssetDto,
  UpdateAssetDto,
  type AssetCategory,
} from './dto/asset.dto';

export const ASSETS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'customerId', header: 'Customer ID' },
  { key: 'projectId', header: 'Project ID' },
  { key: 'category', header: 'Category' },
  { key: 'name', header: 'Name' },
  { key: 'buildingName', header: 'Building Name' },
  { key: 'serialNumber', header: 'Serial Number' },
  { key: 'locationNotes', header: 'Location Notes' },
  { key: 'status', header: 'Status' },
  { key: 'notes', header: 'Notes' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
  { key: 'updatedAt', header: 'Updated At', format: 'date' },
];

@ApiTags('assets')
@ApiBearerAuth('access-token')
@Controller('assets')
@Roles(
  'SALES_MANAGER',
  'TECHNICAL_LEAD',
  'FIELD_ENGINEER',
  'DISPATCHER',
  'WAREHOUSE_MANAGER',
)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List assets (filter + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated asset list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('q') search?: string,
    @Query('category') category?: string,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    const parsedCategory =
      category &&
      (ASSET_CATEGORIES as readonly string[]).includes(category)
        ? (category as AssetCategory)
        : undefined;
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.assetsService.list(user, {
        search,
        category: parsedCategory,
        customerId,
        page,
        pageSize,
      });
      res.json(result);
      return;
    }
    const rows = this.assetsService.streamAll(user, {
      search,
      category: parsedCategory,
      customerId,
    });
    const filename = `assets-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, ASSETS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, ASSETS_EXPORT_COLUMNS, rows);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get asset by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assetsService.getById(user, id);
  }

  @Post()
  @Roles('SALES_MANAGER', 'TECHNICAL_LEAD')
  @ApiOperation({ summary: 'Register asset under a customer' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAssetDto,
  ) {
    return this.assetsService.create(user, dto);
  }

  @Patch(':id')
  @Roles('SALES_MANAGER', 'TECHNICAL_LEAD')
  @ApiOperation({ summary: 'Update asset' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetsService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('SALES_MANAGER', 'TECHNICAL_LEAD')
  @ApiOperation({ summary: 'Soft-delete asset' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.assetsService.softDelete(user, id);
  }
}
