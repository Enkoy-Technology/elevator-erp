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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import { AssetsService } from './assets.service';
import {
  ASSET_CATEGORIES,
  CreateAssetDto,
  UpdateAssetDto,
  type AssetCategory,
} from './dto/asset.dto';

@ApiTags('assets')
@ApiBearerAuth('access-token')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @ApiOperation({ summary: 'List assets (filter + pagination)' })
  @ApiOkResponse({ description: 'Paginated asset list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') search?: string,
    @Query('category') category?: string,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedCategory =
      category &&
      (ASSET_CATEGORIES as readonly string[]).includes(category)
        ? (category as AssetCategory)
        : undefined;
    return this.assetsService.list(user, {
      search,
      category: parsedCategory,
      customerId,
      page,
      pageSize,
    });
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
