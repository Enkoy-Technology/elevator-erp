import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { ChecklistItem } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ProjectsService } from '../projects/projects.service';
import {
  InstallationRepository,
  type ProjectPhaseRecord,
} from './installation.repository';
import { INSTALL_PHASE_SEQUENCE } from './phase-templates';

const PHASE_READY_PROJECT_STATUSES = new Set([
  'CONTRACT',
  'EXECUTION',
  'COMPLETED',
]);

@Injectable()
export class InstallationService {
  constructor(
    private readonly installationRepository: InstallationRepository,
    private readonly projectsService: ProjectsService,
  ) {}

  async listPhases(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<ProjectPhaseRecord[]> {
    const project = await this.projectsService.getById(user, projectId);
    if (!PHASE_READY_PROJECT_STATUSES.has(project.status)) {
      throw new BadRequestException(
        'Installation phases are available after the project reaches CONTRACT',
      );
    }
    return this.installationRepository.ensurePhases(
      user.tenantId,
      projectId,
    );
  }

  async assignCrew(
    user: AuthenticatedUser,
    projectId: string,
    phaseId: string,
    crewId: string,
    leadEngineerUserId?: string,
  ): Promise<ProjectPhaseRecord> {
    const phase = await this.requirePhase(user, projectId, phaseId);
    return this.installationRepository.updatePhase(user.tenantId, phase.id, {
      assignedCrewId: crewId,
      leadEngineerUserId: leadEngineerUserId ?? null,
    });
  }

  async startPhase(
    user: AuthenticatedUser,
    projectId: string,
    phaseId: string,
  ): Promise<ProjectPhaseRecord> {
    const project = await this.projectsService.getById(user, projectId);
    if (project.status === 'CONTRACT') {
      await this.projectsService.updateStatus(user, projectId, 'EXECUTION');
    } else if (project.status !== 'EXECUTION') {
      throw new WorkflowTransitionError(
        'Phases can only start when the project is in CONTRACT or EXECUTION',
      );
    }

    const phase = await this.requirePhase(user, projectId, phaseId);
    if (phase.status !== 'PENDING') {
      throw new WorkflowTransitionError(
        `Cannot start phase in status ${phase.status}`,
      );
    }

    // Prior phases must be completed (sequential).
    const prior = INSTALL_PHASE_SEQUENCE.filter(
      (p) => p.sortOrder < phase.sortOrder,
    );
    const all = await this.installationRepository.listByProject(
      user.tenantId,
      projectId,
    );
    for (const p of prior) {
      const row = all.find((r) => r.phaseKind === p.kind);
      if (!row || row.status !== 'COMPLETED') {
        throw new WorkflowTransitionError(
          `Complete ${p.kind} before starting ${phase.phaseKind}`,
        );
      }
    }

    const inFlight = await this.installationRepository.countInProgress(
      user.tenantId,
      projectId,
      phase.id,
    );
    if (inFlight > 0) {
      throw new WorkflowTransitionError(
        'Another phase is already IN_PROGRESS for this project',
      );
    }

    return this.installationRepository.updatePhase(user.tenantId, phase.id, {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    });
  }

  async updateChecklistItem(
    user: AuthenticatedUser,
    projectId: string,
    phaseId: string,
    itemId: string,
    patch: { completed: boolean; notes?: string; photoUrl?: string },
  ): Promise<ProjectPhaseRecord> {
    const phase = await this.requirePhase(user, projectId, phaseId);
    if (phase.status !== 'IN_PROGRESS') {
      throw new WorkflowTransitionError(
        'Checklist can only be updated while the phase is IN_PROGRESS',
      );
    }
    const items = [...(phase.checklistItems ?? [])];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) {
      throw new NotFoundException('Checklist item not found');
    }
    const current = items[idx]!;
    const next: ChecklistItem = {
      ...current,
      completed: patch.completed,
      notes: patch.notes ?? current.notes ?? null,
      photoUrl: patch.photoUrl ?? current.photoUrl ?? null,
      completedAt: patch.completed ? new Date().toISOString() : null,
      completedBy: patch.completed ? user.userId : null,
    };
    items[idx] = next;
    return this.installationRepository.updatePhase(user.tenantId, phase.id, {
      checklistItems: items,
    });
  }

  async signOff(
    user: AuthenticatedUser,
    projectId: string,
    phaseId: string,
    input: {
      signOffName: string;
      signatureUrl?: string;
      stampUrl?: string;
    },
  ): Promise<ProjectPhaseRecord> {
    const phase = await this.requirePhase(user, projectId, phaseId);
    if (phase.phaseKind !== 'HANDOVER') {
      throw new BadRequestException('Sign-off is only required on HANDOVER');
    }
    if (phase.status !== 'IN_PROGRESS') {
      throw new WorkflowTransitionError(
        'Sign-off requires the HANDOVER phase to be IN_PROGRESS',
      );
    }
    return this.installationRepository.updatePhase(user.tenantId, phase.id, {
      signOffName: input.signOffName,
      signOffSignatureUrl: input.signatureUrl ?? null,
      signOffStampUrl: input.stampUrl ?? null,
      signOffAt: new Date(),
    });
  }

  async completePhase(
    user: AuthenticatedUser,
    projectId: string,
    phaseId: string,
  ): Promise<ProjectPhaseRecord> {
    const phase = await this.requirePhase(user, projectId, phaseId);
    if (phase.status !== 'IN_PROGRESS') {
      throw new WorkflowTransitionError(
        `Cannot complete phase in status ${phase.status}`,
      );
    }
    const incomplete = (phase.checklistItems ?? []).filter(
      (i) => i.required && !i.completed,
    );
    if (incomplete.length > 0) {
      throw new WorkflowTransitionError(
        `${incomplete.length} required checklist item(s) are incomplete`,
      );
    }
    if (phase.phaseKind === 'HANDOVER' && !phase.signOffName) {
      throw new WorkflowTransitionError(
        'HANDOVER requires customer sign-off before completion',
      );
    }

    const completed = await this.installationRepository.updatePhase(
      user.tenantId,
      phase.id,
      {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    );

    if (phase.phaseKind === 'HANDOVER') {
      const project = await this.projectsService.getById(user, projectId);
      if (project.status === 'EXECUTION') {
        await this.projectsService.updateStatus(user, projectId, 'COMPLETED');
      }
    }

    return completed;
  }

  private async requirePhase(
    user: AuthenticatedUser,
    projectId: string,
    phaseId: string,
  ): Promise<ProjectPhaseRecord> {
    await this.listPhases(user, projectId);
    const phase = await this.installationRepository.findById(
      user.tenantId,
      phaseId,
    );
    if (!phase || phase.projectId !== projectId) {
      throw new NotFoundException('Project phase not found');
    }
    return phase;
  }
}
