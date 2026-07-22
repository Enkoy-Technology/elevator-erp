import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { CrewsService } from './crews.service';
import { AddCrewMemberDto, CreateCrewDto } from './dto/create-crew.dto';

@ApiTags('crews')
@ApiBearerAuth('access-token')
@Controller('crews')
export class CrewsController {
  constructor(private readonly crewsService: CrewsService) {}

  @Get()
  @ApiOperation({ summary: 'List crews (paginated)' })
  @ApiOkResponse({ description: 'Paginated crew list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.crewsService.list(user, {
      page,
      pageSize,
      activeOnly: activeOnly === 'true' || activeOnly === '1',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get crew with members' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.crewsService.getById(user, id);
  }

  @Post()
  @Roles('TECHNICAL_LEAD')
  @ApiOperation({ summary: 'Create crew' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCrewDto,
  ) {
    return this.crewsService.create(user, dto);
  }

  @Post(':id/members')
  @Roles('TECHNICAL_LEAD')
  @ApiOperation({ summary: 'Add or update crew member' })
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCrewMemberDto,
  ) {
    return this.crewsService.addMember(
      user,
      id,
      dto.userId,
      dto.isLead ?? false,
    );
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  @Roles('TECHNICAL_LEAD')
  @ApiOperation({ summary: 'Remove crew member' })
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.crewsService.removeMember(user, id, userId);
  }
}
