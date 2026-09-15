import type { ProjectStatus } from '../../database/schema/projects';

/**
 * Allowed next statuses. Creating a quotation and signing a contract move
 * the project on their own (autoAdvanceProject); the buttons exist for the
 * moves that have no document behind them.
 */
export const PROJECT_STATUS_TRANSITIONS: Readonly<
  Record<ProjectStatus, readonly ProjectStatus[]>
> = {
  LEAD: ['QUOTATION', 'CANCELLED'],
  QUOTATION: ['CONTRACT', 'CANCELLED'],
  CONTRACT: ['EXECUTION', 'CANCELLED'],
  EXECUTION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransitionProjectStatus = (
  from: ProjectStatus,
  to: ProjectStatus,
): boolean => PROJECT_STATUS_TRANSITIONS[from].includes(to);

/**
 * The DAG's happy path, LEAD -> ... -> COMPLETED, derived from the table
 * above so there is exactly one source of truth: at each stage there is only
 * one successor that isn't CANCELLED. Auto-advance walks this spine.
 */
export const PROJECT_STATUS_SPINE: readonly ProjectStatus[] = (() => {
  const spine: ProjectStatus[] = ['LEAD'];
  for (;;) {
    const next = PROJECT_STATUS_TRANSITIONS[spine[spine.length - 1]!].find(
      (s) => s !== 'CANCELLED',
    );
    if (!next) {
      return spine;
    }
    spine.push(next);
  }
})();

/**
 * How far along the happy path a project is. `null` for CANCELLED, which sits
 * off the spine entirely and must never be auto-advanced. COMPLETED ranks
 * last, so "already at or past the target" covers it with no special case.
 */
export const projectStageRank = (status: ProjectStatus): number | null => {
  const index = PROJECT_STATUS_SPINE.indexOf(status);
  return index === -1 ? null : index;
};
