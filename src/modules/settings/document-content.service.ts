import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import {
  DocumentContentRepository,
  type BoilerplateSection,
  type ComponentSpecification,
} from './document-content.repository';
import type {
  CreateBoilerplateSectionDto,
  CreateComponentSpecificationDto,
  ReorderDto,
  UpdateBoilerplateSectionDto,
  UpdateComponentSpecificationDto,
} from './dto/document-content.dto';

/**
 * Exported from SettingsModule so the document-rendering path can read the
 * tenant's sections and component table instead of each quotation carrying
 * its own pasted copy.
 */
@Injectable()
export class DocumentContentService {
  constructor(private readonly repository: DocumentContentRepository) {}

  listBoilerplate(user: AuthenticatedUser): Promise<BoilerplateSection[]> {
    return this.repository.listBoilerplate(user.tenantId);
  }

  /** Active sections only, in print order — what a rendered document shows. */
  async listActiveBoilerplate(tenantId: string): Promise<BoilerplateSection[]> {
    const sections = await this.repository.listBoilerplate(tenantId);
    return sections.filter((section) => section.isActive);
  }

  createBoilerplate(
    user: AuthenticatedUser,
    dto: CreateBoilerplateSectionDto,
  ): Promise<BoilerplateSection> {
    return this.repository.createBoilerplate(user.tenantId, dto);
  }

  updateBoilerplate(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateBoilerplateSectionDto,
  ): Promise<BoilerplateSection> {
    return this.repository.updateBoilerplate(user.tenantId, id, dto);
  }

  deactivateBoilerplate(
    user: AuthenticatedUser,
    id: string,
  ): Promise<BoilerplateSection> {
    return this.repository.deactivateBoilerplate(user.tenantId, id);
  }

  reorderBoilerplate(
    user: AuthenticatedUser,
    dto: ReorderDto,
  ): Promise<BoilerplateSection[]> {
    return this.repository.reorderBoilerplate(user.tenantId, dto.ids);
  }

  listComponents(user: AuthenticatedUser): Promise<ComponentSpecification[]> {
    return this.repository.listComponents(user.tenantId);
  }

  /** Print order, for the renderer. */
  listComponentsForTenant(tenantId: string): Promise<ComponentSpecification[]> {
    return this.repository.listComponents(tenantId);
  }

  createComponent(
    user: AuthenticatedUser,
    dto: CreateComponentSpecificationDto,
  ): Promise<ComponentSpecification> {
    return this.repository.createComponent(user.tenantId, dto);
  }

  updateComponent(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateComponentSpecificationDto,
  ): Promise<ComponentSpecification> {
    return this.repository.updateComponent(user.tenantId, id, dto);
  }

  deleteComponent(user: AuthenticatedUser, id: string): Promise<void> {
    return this.repository.deleteComponent(user.tenantId, id);
  }

  reorderComponents(
    user: AuthenticatedUser,
    dto: ReorderDto,
  ): Promise<ComponentSpecification[]> {
    return this.repository.reorderComponents(user.tenantId, dto.ids);
  }
}
