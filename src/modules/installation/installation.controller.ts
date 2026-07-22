import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  AssignPhaseCrewDto,
  PhaseSignOffDto,
  UpdateChecklistItemDto,
} from './dto/phase-actions.dto';
import { InstallationService } from './installation.service';

@ApiTags('installation')
@ApiBearerAuth('access-token')
@Controller('projects/:projectId/phases')
export class InstallationController {
  constructor(private readonly installationService: InstallationService) {}

  @Get()
  @ApiOperation({ summary: 'List (and auto-create) installation phases' })
  @ApiOkResponse({ description: 'Ordered project phases' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.installationService.listPhases(user, projectId);
  }

  @Post(':phaseId/assign')
  @Roles('TECHNICAL_LEAD')
  @ApiOperation({ summary: 'Assign crew (and optional lead) to a phase' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Body() dto: AssignPhaseCrewDto,
  ) {
    return this.installationService.assignCrew(
      user,
      projectId,
      phaseId,
      dto.crewId,
      dto.leadEngineerUserId,
    );
  }

  @Patch(':phaseId/start')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER')
  @ApiOperation({ summary: 'Start a PENDING phase (sequential)' })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
  ) {
    return this.installationService.startPhase(user, projectId, phaseId);
  }

  @Post(':phaseId/checklist/:itemId')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER')
  @ApiOperation({ summary: 'Update a checklist item' })
  updateChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.installationService.updateChecklistItem(
      user,
      projectId,
      phaseId,
      itemId,
      dto,
    );
  }

  @Post(':phaseId/sign-off')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER')
  @ApiOperation({ summary: 'Capture HANDOVER customer sign-off' })
  signOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Body() dto: PhaseSignOffDto,
  ) {
    return this.installationService.signOff(user, projectId, phaseId, dto);
  }

  @Patch(':phaseId/complete')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER')
  @ApiOperation({ summary: 'Complete phase when required checklist is done' })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
  ) {
    return this.installationService.completePhase(user, projectId, phaseId);
  }
}
