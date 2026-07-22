import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { CreateProjectDto } from './dto/create-project.dto';
import {
  PROJECT_STATUSES,
  UpdateProjectStatusDto,
} from './dto/update-project-status.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth('access-token')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects (optional status filter)' })
  @ApiOkResponse({ description: 'Project list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    if (
      status !== undefined &&
      !(PROJECT_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${PROJECT_STATUSES.join(', ')}`,
      );
    }
    return this.projectsService.list(
      user,
      status as (typeof PROJECT_STATUSES)[number] | undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projectsService.getById(user, id);
  }

  @Post()
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Create project/lead (starts at LEAD)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(user, dto);
  }

  @Patch(':id/status')
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Advance or cancel project via status DAG' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectStatusDto,
  ) {
    return this.projectsService.updateStatus(user, id, dto.status);
  }
}
