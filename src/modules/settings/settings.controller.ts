import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth('access-token')
@Controller('settings')
// Spec §5.3 Tenant Config (View): every staff role. Edit stays with ADMIN (and CEO via SUPER_ROLES).
@Roles('GENERAL_MANAGER', 'MARKETING_MANAGER', 'SALES_MANAGER', 'SALESPERSON', 'FINANCE_OFFICER', 'OFFICE_MANAGER', 'TECHNICAL_MANAGER', 'MAINTENANCE_ENGINEER', 'STORE_KEEPER', 'SECRETARY')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get tenant branding and locale settings' })
  @ApiOkResponse({ description: 'Current settings' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.get(user);
  }

  @Patch()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update branding and default language' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settingsService.update(user, dto);
  }
}
