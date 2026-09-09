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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  BroadcastDto,
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
} from './dto/messaging.dto';
import { MessagingService, STARTER_TEMPLATES } from './messaging.service';

/**
 * Composing messages, as opposed to reading the delivery log (OutboxController).
 * The requirement document gives "internal communication" to the Office
 * Manager and "campaign management" to the Marketing Manager; the General
 * Manager coordinates departments. Admin and CEO pass as always.
 */
@ApiTags('messaging')
@ApiBearerAuth('access-token')
@Controller('messaging')
@Roles('ADMIN', 'GENERAL_MANAGER', 'OFFICE_MANAGER', 'MARKETING_MANAGER')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Saved templates plus the built-in starters (holidays, announcements)' })
  async templates(@CurrentUser() user: AuthenticatedUser) {
    const saved = await this.messagingService.listTemplates(user);
    return { saved, starters: STARTER_TEMPLATES };
  }

  @Post('templates')
  @ApiOperation({ summary: 'Save a template. {{name}} and {{company}} are filled per recipient.' })
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMessageTemplateDto) {
    return this.messagingService.createTemplate(user, dto);
  }

  @Patch('templates/:id')
  @ApiOperation({ summary: 'Edit a saved template' })
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMessageTemplateDto,
  ) {
    return this.messagingService.updateTemplate(user, id, dto);
  }

  @Delete('templates/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a saved template (soft delete)' })
  deleteTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messagingService.deleteTemplate(user, id);
  }

  @Post('broadcasts/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'How many people a broadcast would reach, and how many would be held for missing phone or consent. Sends nothing.' })
  preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: BroadcastDto) {
    return this.messagingService.preview(user, dto);
  }

  @Post('broadcasts')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Queue one SMS per recipient (employees by role, or customers). sendAt schedules it; the dispatcher sends at that time. Every row lands in the Messages log tagged BROADCAST.',
  })
  broadcast(@CurrentUser() user: AuthenticatedUser, @Body() dto: BroadcastDto) {
    return this.messagingService.broadcast(user, dto);
  }
}
