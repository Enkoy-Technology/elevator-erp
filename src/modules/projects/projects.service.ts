import { Injectable, NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { PaginatedResult } from '../../common/pagination';
import type { ProjectStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateProjectDto } from './dto/create-project.dto';
import { canTransitionProjectStatus } from './project-status';
import {
  ProjectsRepository,
  type ProjectInsert,
  type ProjectRecord,
} from './projects.repository';

// PROFORMA/CONTRACT are reached only by converting a quotation (which requires
// an approved quote), never by a direct status PATCH — see FEATURE-phase2-
// quotations.md #3. QuotationsService drives them via applyQuotationConversion.
const QUOTATION_DRIVEN_STATUSES: ReadonlySet<ProjectStatus> = new Set([
  'PROFORMA',
  'CONTRACT',
]);

@Injectable()
export class ProjectsService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  list(
    user: AuthenticatedUser,
    options: {
      status?: ProjectStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ProjectRecord>> {
    return this.projectsRepository.list(user.tenantId, options);
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

  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    nextStatus: ProjectStatus,
  ): Promise<ProjectRecord> {
    if (QUOTATION_DRIVEN_STATUSES.has(nextStatus)) {
      throw new WorkflowTransitionError(
        `Project reaches ${nextStatus} by converting a quotation, not a direct status change`,
      );
    }
    const project = await this.getById(user, id);
    if (!canTransitionProjectStatus(project.status, nextStatus)) {
      throw new WorkflowTransitionError(
        `Cannot transition project from ${project.status} to ${nextStatus}`,
      );
    }
    return this.projectsRepository.updateStatus(
      user.tenantId,
      id,
      nextStatus,
    );
  }

  /**
   * Advance a project as a side-effect of a quotation conversion. Skips the
   * manual-PATCH block above (this IS the sanctioned path) and no-ops if the
   * project has already moved past the target (independent of the quote).
   */
  async applyQuotationConversion(
    user: AuthenticatedUser,
    projectId: string,
    nextStatus: ProjectStatus,
    extra: Partial<
      Pick<ProjectInsert, 'quotedAmountEtb' | 'contractAmountEtb'>
    > = {},
  ): Promise<ProjectRecord> {
    const project = await this.getById(user, projectId);
    if (!canTransitionProjectStatus(project.status, nextStatus)) {
      return project;
    }
    return this.projectsRepository.updateStatus(
      user.tenantId,
      projectId,
      nextStatus,
      extra,
    );
  }
}
