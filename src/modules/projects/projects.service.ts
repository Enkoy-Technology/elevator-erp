import { Injectable, NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { PaginatedResult } from '../../common/pagination';
import type { ProjectStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateProjectDto } from './dto/create-project.dto';
import { canTransitionProjectStatus } from './project-status';
import {
  ProjectsRepository,
  type ProjectExportRow,
  type ProjectInsert,
  type ProjectRecord,
} from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  list(
    user: AuthenticatedUser,
    options: {
      status?: ProjectStatus;
      q?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ProjectRecord>> {
    return this.projectsRepository.list(user.tenantId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    options: { status?: ProjectStatus; q?: string },
  ): AsyncGenerator<ProjectExportRow> {
    return this.projectsRepository.streamAll(user.tenantId, options);
  }

  async getById(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ProjectRecord> {
    const row = await this.projectsRepository.findById(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Project not found');
    }
    return row;
  }

  create(
    user: AuthenticatedUser,
    dto: CreateProjectDto,
  ): Promise<ProjectRecord> {
    return this.projectsRepository.create(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  /**
   * Advance or cancel a project along the status DAG. Deal values are set here
   * because that is when the rep knows them — quoted on the way into QUOTATION,
   * contract value on the way into CONTRACT.
   */
  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    nextStatus: ProjectStatus,
    amounts: Partial<
      Pick<ProjectInsert, 'quotedAmountEtb' | 'contractAmountEtb'>
    > = {},
  ): Promise<ProjectRecord> {
    const project = await this.getById(user, id);
    if (!canTransitionProjectStatus(project.status, nextStatus)) {
      throw new WorkflowTransitionError(
        `Cannot transition project from ${project.status} to ${nextStatus}`,
      );
    }
    return this.projectsRepository.updateStatus(
      user.tenantId,
      id,
      project.status,
      nextStatus,
      amounts,
    );
  }
}
