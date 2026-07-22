import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import {
  projectPhases,
  type ChecklistItem,
  type InstallPhaseKind,
  type InstallPhaseStatus,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  defaultChecklistFor,
  INSTALL_PHASE_SEQUENCE,
} from './phase-templates';

export type ProjectPhaseRecord = typeof projectPhases.$inferSelect;

@Injectable()
export class InstallationRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async listByProject(
    tenantId: string,
    projectId: string,
  ): Promise<ProjectPhaseRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      return tx
        .select()
        .from(projectPhases)
        .where(eq(projectPhases.projectId, projectId))
        .orderBy(asc(projectPhases.sortOrder));
    });
  }

  async findById(
    tenantId: string,
    phaseId: string,
  ): Promise<ProjectPhaseRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async ensurePhases(
    tenantId: string,
    projectId: string,
  ): Promise<ProjectPhaseRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const existing = await tx
        .select()
        .from(projectPhases)
        .where(eq(projectPhases.projectId, projectId));
      if (existing.length > 0) {
        return existing.sort((a, b) => a.sortOrder - b.sortOrder);
      }
      const inserted: ProjectPhaseRecord[] = [];
      for (const phase of INSTALL_PHASE_SEQUENCE) {
        const [row] = await tx
          .insert(projectPhases)
          .values({
            tenantId,
            projectId,
            phaseKind: phase.kind,
            sortOrder: phase.sortOrder,
            status: 'PENDING',
            checklistItems: defaultChecklistFor(phase.kind),
          })
          .returning();
        if (row) {
          inserted.push(row);
        }
      }
      return inserted;
    });
  }

  async updatePhase(
    tenantId: string,
    phaseId: string,
    patch: {
      status?: InstallPhaseStatus;
      checklistItems?: ChecklistItem[];
      assignedCrewId?: string | null;
      leadEngineerUserId?: string | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
      signOffName?: string | null;
      signOffSignatureUrl?: string | null;
      signOffStampUrl?: string | null;
      signOffAt?: Date | null;
      notes?: string | null;
    },
  ): Promise<ProjectPhaseRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(projectPhases)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(projectPhases.id, phaseId))
        .returning();
      if (!row) {
        throw new NotFoundException('Project phase not found');
      }
      return row;
    });
  }

  async countInProgress(
    tenantId: string,
    projectId: string,
    excludePhaseId?: string,
  ): Promise<number> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(projectPhases)
        .where(
          and(
            eq(projectPhases.projectId, projectId),
            eq(projectPhases.status, 'IN_PROGRESS'),
          ),
        );
      return rows.filter((r) => r.id !== excludePhaseId).length;
    });
  }

  async findByKind(
    tenantId: string,
    projectId: string,
    kind: InstallPhaseKind,
  ): Promise<ProjectPhaseRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(projectPhases)
        .where(
          and(
            eq(projectPhases.projectId, projectId),
            eq(projectPhases.phaseKind, kind),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });
  }
}
