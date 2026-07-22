import { randomUUID } from 'node:crypto';

import type {
  ChecklistItem,
  InstallPhaseKind,
} from '../../database/schema/project-phases';

export const INSTALL_PHASE_SEQUENCE: readonly {
  kind: InstallPhaseKind;
  sortOrder: number;
  labels: readonly string[];
}[] = [
  {
    kind: 'SHAFT_PREPARATION',
    sortOrder: 1,
    labels: [
      'Shaft plumb and dimensions verified',
      'Pit cleaned and drained',
      'Buffer supports installed',
      'Safety barriers in place',
    ],
  },
  {
    kind: 'MECHANICAL_ASSEMBLY',
    sortOrder: 2,
    labels: [
      'Guide rails aligned and bolted',
      'Car frame assembled',
      'Counterweight installed',
      'Machine / traction equipment set',
    ],
  },
  {
    kind: 'ELECTRICAL_WIRING',
    sortOrder: 3,
    labels: [
      'Controller landed and bonded',
      'Travelling cable routed',
      'Landing stations wired',
      'Safety circuit continuity verified',
    ],
  },
  {
    kind: 'TESTING_COMMISSIONING',
    sortOrder: 4,
    labels: [
      'No-load run completed',
      'Full-load brake test recorded',
      'Door timing adjusted',
      'Governor / safety gear tested',
    ],
  },
  {
    kind: 'HANDOVER',
    sortOrder: 5,
    labels: [
      'As-built drawings issued',
      'O&M manuals delivered',
      'Customer training completed',
      'Warranty start date confirmed',
    ],
  },
];

export const defaultChecklistFor = (
  kind: InstallPhaseKind,
): ChecklistItem[] => {
  const phase = INSTALL_PHASE_SEQUENCE.find((p) => p.kind === kind);
  if (!phase) {
    return [];
  }
  return phase.labels.map((label) => ({
    id: randomUUID(),
    label,
    required: true,
    completed: false,
    completedAt: null,
    completedBy: null,
    photoUrl: null,
    notes: null,
  }));
};
