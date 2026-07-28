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
@Roles('SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects (status filter + pagination)' })
  @ApiOkResponse({ description: 'Paginated project list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (
      status !== undefined &&
      !(PROJECT_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${PROJECT_STATUSES.join(', ')}`,
      );
    }
    return this.projectsService.list(user, {
      status: status as (typeof PROJECT_STATUSES)[number] | undefined,
      page,
      pageSize,
    });
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
  @ApiOperation({
    summary: 'Advance or cancel project via status DAG, optionally with the deal value',
  })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectStatusDto,
  ) {
    return this.projectsService.updateStatus(user, id, dto.status, {
      ...(dto.quotedAmountEtb !== undefined
        ? { quotedAmountEtb: dto.quotedAmountEtb }
        : {}),
      ...(dto.contractAmountEtb !== undefined
        ? { contractAmountEtb: dto.contractAmountEtb }
        : {}),
    });
  }
}
