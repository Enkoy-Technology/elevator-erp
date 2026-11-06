import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import { AssetTrackingService } from './asset-tracking.service';
import {
  CorrectAssetStatusDto,
  MoveAssetDto,
  SetSoldToDto,
  UpdateChecklistItemDto,
} from './dto/asset.dto';

@ApiTags('assets')
@ApiBearerAuth('access-token')
@Controller('assets/:id')
@Roles(
  'GENERAL_MANAGER',
  'SALES_MANAGER',
  'SALESPERSON',
  'TECHNICAL_MANAGER',
  'MAINTENANCE_ENGINEER',
  'STORE_KEEPER',
)
export class AssetTrackingController {
  constructor(private readonly trackingService: AssetTrackingService) {}

  @Get('tracking')
  @ApiOperation({
    summary: 'A lift with its checklist, history and next steps',
  })
  getTracking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trackingService.getTracking(user, id);
  }

  @Post('status')
  @HttpCode(200)
  @Roles(
    'GENERAL_MANAGER',
    'TECHNICAL_MANAGER',
    'MAINTENANCE_ENGINEER',
    'STORE_KEEPER',
  )
  @ApiOperation({ summary: 'Move a lift to its next allowed status' })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveAssetDto,
  ) {
    return this.trackingService.move(user, id, dto);
  }

  @Post('status/correct')
  @HttpCode(200)
  @Roles('GENERAL_MANAGER')
  @ApiOperation({ summary: 'Put a wrong status right, with a recorded reason' })
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectAssetStatusDto,
  ) {
    return this.trackingService.correct(user, id, dto);
  }

  @Put('sold-to')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({ summary: 'Set or clear who a lift is sold to' })
  setSoldTo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSoldToDto,
  ) {
    return this.trackingService.setSoldTo(user, id, dto);
  }

  @Patch('checklist/:itemId')
  @Roles('GENERAL_MANAGER', 'TECHNICAL_MANAGER', 'STORE_KEEPER')
  @ApiOperation({ summary: 'Mark one checklist row, or correct its quantity' })
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.trackingService.updateItem(user, id, itemId, dto);
  }

  @Post('checklist/cases/:caseNo/all-ok')
  @HttpCode(200)
  @Roles('GENERAL_MANAGER', 'TECHNICAL_MANAGER', 'STORE_KEEPER')
  @ApiOperation({ summary: 'Mark every unmarked row of one case as OK' })
  markCaseOk(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseNo', ParseIntPipe) caseNo: number,
  ) {
    return this.trackingService.markCaseOk(user, id, caseNo);
  }
}
