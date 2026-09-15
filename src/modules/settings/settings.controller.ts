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
// Reading company settings is management's; the office and marketing
// managers read them for the messaging screen (reminder cadence, locale).
@Roles('GENERAL_MANAGER', 'OFFICE_MANAGER', 'MARKETING_MANAGER')
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
