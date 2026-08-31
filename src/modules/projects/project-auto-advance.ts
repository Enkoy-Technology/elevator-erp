import { Logger } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { TenantTransaction } from '../../database/database.types';
import { projects, type ProjectStatus } from '../../database/schema';
import { projectStageRank } from './project-status';

const logger = new Logger('ProjectAutoAdvance');

/**
 * Move a project forward to `target` inside the CALLER'S transaction, so the
 * stage change commits or rolls back together with the quotation/proforma
 * that caused it — a quotation can never exist next to a project that failed
 * to advance.
 *
 * Never throws and never fails the caller's action: the stage is a
 * consequence of the work, not a gate on it. It is a silent no-op when the
 * project is already at or past `target` (idempotent re-runs, COMPLETED), is
 * CANCELLED (off the spine), was deleted, or was moved concurrently (the CAS
 * below simply matches no rows). Only forward moves along the spine in
 * project-status.ts ever happen; nothing here can move a project backwards.
 *
 * Takes a `tx` rather than injecting ProjectsService because a service call
 * would open its own second transaction — the same reasoning that has
 * ProformasRepository.issue write the shared `quotations` table directly.
 * The manual path's "must have an issued proforma" gate in
 * ProjectsService.updateStatus is deliberately not applied: the caller's
 * transaction IS the event that gate exists to look for.
 */
export const autoAdvanceProject = async (
  tx: TenantTransaction,
  projectId: string,
  target: ProjectStatus,
): Promise<void> => {
  const [current] = await tx
    .select({ status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!current) {
    return;
  }

  const fromRank = projectStageRank(current.status);
  const targetRank = projectStageRank(target);
  if (fromRank === null || targetRank === null || fromRank >= targetRank) {
    logger.debug(
      `Project ${projectId} stays at ${current.status}; no forward move to ${target}`,
    );
    return;
  }

  const now = new Date();
  await tx
    .update(projects)
    .set({ status: target, statusChangedAt: now, updatedAt: now })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.status, current.status),
        isNull(projects.deletedAt),
      ),
    );
  logger.log(
    `Project ${projectId} auto-advanced ${current.status} -> ${target}`,
  );
};
