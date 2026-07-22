import { WorkflowTransitionError } from '../../common/exceptions';
import type { AuthenticatedUser } from '../../types/auth.types';
import { InstallationService } from './installation.service';
import type { ProjectPhaseRecord } from './installation.repository';

describe('InstallationService', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'TECHNICAL_LEAD',
    permissions: [],
  };

  const phase = (overrides: Partial<ProjectPhaseRecord>): ProjectPhaseRecord =>
    ({
      tenantId: user.tenantId,
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      projectId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      phaseKind: 'SHAFT_PREPARATION',
      sortOrder: 1,
      status: 'PENDING',
      checklistItems: [
        {
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          label: 'Shaft plumb',
          required: true,
          completed: false,
        },
      ],
      assignedCrewId: null,
      leadEngineerUserId: null,
      startedAt: null,
      completedAt: null,
      signOffName: null,
      signOffSignatureUrl: null,
      signOffStampUrl: null,
      signOffAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as ProjectPhaseRecord;

  const repo = {
    ensurePhases: jest.fn(),
    listByProject: jest.fn(),
    findById: jest.fn(),
    updatePhase: jest.fn(),
    countInProgress: jest.fn(),
    findByKind: jest.fn(),
  };

  const projects = {
    getById: jest.fn(),
    updateStatus: jest.fn(),
  };

  const service = new InstallationService(repo as never, projects as never);

  beforeEach(() => {
    jest.clearAllMocks();
    projects.getById.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      status: 'EXECUTION',
    });
    repo.ensurePhases.mockResolvedValue([phase({})]);
    repo.countInProgress.mockResolvedValue(0);
    repo.listByProject.mockResolvedValue([phase({})]);
  });

  it('starts a PENDING first phase', async () => {
    const pending = phase({});
    repo.findById.mockResolvedValue(pending);
    repo.updatePhase.mockResolvedValue({
      ...pending,
      status: 'IN_PROGRESS',
    });
    await expect(
      service.startPhase(user, pending.projectId, pending.id),
    ).resolves.toMatchObject({ status: 'IN_PROGRESS' });
  });

  it('blocks complete when required checklist items remain', async () => {
    const inProgress = phase({ status: 'IN_PROGRESS' });
    repo.findById.mockResolvedValue(inProgress);
    await expect(
      service.completePhase(user, inProgress.projectId, inProgress.id),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('completes when checklist is done', async () => {
    const inProgress = phase({
      status: 'IN_PROGRESS',
      checklistItems: [
        {
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          label: 'Shaft plumb',
          required: true,
          completed: true,
        },
      ],
    });
    repo.findById.mockResolvedValue(inProgress);
    repo.updatePhase.mockResolvedValue({
      ...inProgress,
      status: 'COMPLETED',
    });
    await expect(
      service.completePhase(user, inProgress.projectId, inProgress.id),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
  });
});
