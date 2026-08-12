import type { AuthenticatedUser } from '../../types/auth.types';
import { MaintenanceService } from './maintenance.service';

// createBreakdown/updateBreakdown call MaintenanceReminderService's
// immediate (not cron) breakdown-assignment reminder (task-2 brief §2.2)
// right after the DB write — never before it (the reminder must reflect
// what was actually persisted) and only when the resulting row is assigned.

const user: AuthenticatedUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  role: 'DISPATCHER',
};

const build = (breakdownRow: { id: string; assignedUserId: string | null }) => {
  const maintenanceRepository = {
    createBreakdown: jest.fn(async () => breakdownRow),
    updateBreakdown: jest.fn(async () => breakdownRow),
  };
  const maintenanceReminderService = {
    notifyBreakdownAssigned: jest.fn(async () => undefined),
  };
  const service = new MaintenanceService(
    maintenanceRepository as never,
    maintenanceReminderService as never,
  );
  return { service, maintenanceRepository, maintenanceReminderService };
};

describe('MaintenanceService.createBreakdown', () => {
  it('notifies the reminder service when the new breakdown is assigned', async () => {
    const { service, maintenanceReminderService } = build({
      id: 'bd-1',
      assignedUserId: 'tech-1',
    });

    await service.createBreakdown(user, {
      assetId: 'asset-1',
      title: 'Stuck',
    });

    expect(maintenanceReminderService.notifyBreakdownAssigned).toHaveBeenCalledWith(
      user.tenantId,
      'bd-1',
    );
  });

  it('does not notify when the new breakdown has no assignee', async () => {
    const { service, maintenanceReminderService } = build({
      id: 'bd-1',
      assignedUserId: null,
    });

    await service.createBreakdown(user, {
      assetId: 'asset-1',
      title: 'Stuck',
    });

    expect(maintenanceReminderService.notifyBreakdownAssigned).not.toHaveBeenCalled();
  });
});

describe('MaintenanceService.updateBreakdown', () => {
  it('notifies the reminder service when the update leaves the breakdown assigned', async () => {
    const { service, maintenanceReminderService } = build({
      id: 'bd-1',
      assignedUserId: 'tech-2',
    });

    await service.updateBreakdown(user, 'bd-1', { assignedUserId: 'tech-2' });

    expect(maintenanceReminderService.notifyBreakdownAssigned).toHaveBeenCalledWith(
      user.tenantId,
      'bd-1',
    );
  });

  it('fires again on every write that leaves the SAME assignee — idempotency is the outbox dedupeKey\'s job, not this call site\'s', async () => {
    const { service, maintenanceRepository, maintenanceReminderService } = build({
      id: 'bd-1',
      assignedUserId: 'tech-2',
    });

    await service.updateBreakdown(user, 'bd-1', { severity: 'HIGH' } as never);
    await service.updateBreakdown(user, 'bd-1', { severity: 'CRITICAL' } as never);

    expect(maintenanceRepository.updateBreakdown).toHaveBeenCalledTimes(2);
    expect(maintenanceReminderService.notifyBreakdownAssigned).toHaveBeenCalledTimes(2);
  });

  it('does not notify when the update clears the assignee', async () => {
    const { service, maintenanceReminderService } = build({
      id: 'bd-1',
      assignedUserId: null,
    });

    await service.updateBreakdown(user, 'bd-1', { assignedUserId: null });

    expect(maintenanceReminderService.notifyBreakdownAssigned).not.toHaveBeenCalled();
  });
});
