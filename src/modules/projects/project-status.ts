import type { ProjectStatus } from '../../database/schema/projects';

/**
 * Allowed next statuses per TAD §3.4 project status DAG.
 * Blocking side-effects (survey upload, quote approval, etc.) land in later slices.
 */
export const PROJECT_STATUS_TRANSITIONS: Readonly<
  Record<ProjectStatus, readonly ProjectStatus[]>
> = {
  LEAD: ['SITE_SURVEY', 'CANCELLED'],
  SITE_SURVEY: ['SPEC_CALCULATION', 'CANCELLED'],
  SPEC_CALCULATION: ['QUOTATION', 'CANCELLED'],
  QUOTATION: ['PROFORMA', 'CANCELLED'],
  PROFORMA: ['CONTRACT', 'CANCELLED'],
  CONTRACT: ['EXECUTION', 'CANCELLED'],
  EXECUTION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransitionProjectStatus = (
  from: ProjectStatus,
  to: ProjectStatus,
): boolean => PROJECT_STATUS_TRANSITIONS[from].includes(to);
