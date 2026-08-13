import type { DueMaintenanceReminder } from './maintenance-reminders.repository';
import { MaintenanceReminderService } from './maintenance-reminders.service';

const TENANT_ID = 't1';

const contract = (
  overrides: Partial<DueMaintenanceReminder> = {},
): DueMaintenanceReminder => ({
  contractId: 'contract-1',
  nextServiceAt: '2026-08-11',
  assetName: 'Elevator 2',
  site: 'West Wing',
  customerId: 'customer-1',
  customerName: 'Addis Heights PLC',
  // The client's own test handset (task-3 brief §3.0) — shared by both
  // recipients on purpose; every test below tells technician vs customer
  // apart by dedupeKey suffix (`:technician`/`:customer`), never by phone
  // number, same "recipients differ, the number doesn't have to" precedent
  // as outbox-message-log.e2e-spec.ts.
  customerPhone: '+251949922604',
  customerSmsConsentAt: new Date('2026-01-01T00:00:00Z'),
  technicianId: 'tech-1',
  technicianPhone: '+251949922604',
  technicianSmsConsentAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const build = (contracts: DueMaintenanceReminder[], windowDays = 3) => {
  const tenantDirectory = {
    listActiveTenantIds: jest.fn(async () => [TENANT_ID]),
  };
  const remindersRepository = {
    listDueContracts: jest.fn(async () => ({ windowDays, contracts })),
    getBreakdownAssignmentInfo: jest.fn(),
    recordConsentSkipCount: jest.fn(),
  };
  const outboxService = { enqueue: jest.fn(async (input: unknown) => input) };
  const notificationsRepository = {
    create: jest.fn(async (_tenantId: string, _createdBy: string | null, _dto: unknown) => ({})),
    existsByLinkPath: jest.fn(
      async (_tenantId: string, _userId: string, _type: string, _linkPath: string) => false,
    ),
  };

  const service = new MaintenanceReminderService(
    tenantDirectory as never,
    remindersRepository as never,
    outboxService as never,
    notificationsRepository as never,
  );
  return { service, tenantDirectory, remindersRepository, outboxService, notificationsRepository };
};

describe('MaintenanceReminderService.runDailyReminders — consent gate', () => {
  it('skips the technician SMS when technicianSmsConsentAt is null, but still creates the in-app notification', async () => {
    const { service, outboxService, notificationsRepository } = build([
      contract({ technicianSmsConsentAt: null }),
    ]);

    await service.runDailyReminders();

    const smsCalls = (outboxService.enqueue.mock.calls as [{ dedupeKey: string }][]).filter(
      ([input]) => input.dedupeKey.endsWith(':technician'),
    );
    expect(smsCalls).toHaveLength(0);
    expect(notificationsRepository.create).toHaveBeenCalledWith(
      TENANT_ID,
      null,
      expect.objectContaining({ userId: 'tech-1', type: 'MAINTENANCE' }),
    );
  });

  it('skips the customer SMS when customerSmsConsentAt is null, and records the skip count for GET /settings (task-3 §3.4)', async () => {
    const { service, outboxService, remindersRepository } = build([
      contract({ customerSmsConsentAt: null }),
    ]);

    await service.runDailyReminders();

    const smsCalls = (outboxService.enqueue.mock.calls as [{ dedupeKey: string }][]).filter(
      ([input]) => input.dedupeKey.endsWith(':customer'),
    );
    expect(smsCalls).toHaveLength(0);
    expect(remindersRepository.recordConsentSkipCount).toHaveBeenCalledWith(TENANT_ID, 1);
  });

  it('sends both SMS when both recipients have consent', async () => {
    const { service, outboxService } = build([contract()]);

    await service.runDailyReminders();

    expect(outboxService.enqueue).toHaveBeenCalledTimes(2);
  });
});

describe('MaintenanceReminderService.runDailyReminders — dedupe key stability', () => {
  it('running the cron five times against the same due contract computes the SAME dedupeKey every time', async () => {
    const { service, outboxService } = build([contract()]);

    for (let i = 0; i < 5; i++) {
      await service.runDailyReminders();
    }

    const technicianKeys = new Set(
      (outboxService.enqueue.mock.calls as [{ dedupeKey: string }][])
        .filter(([input]) => input.dedupeKey.endsWith(':technician'))
        .map(([input]) => input.dedupeKey),
    );
    const customerKeys = new Set(
      (outboxService.enqueue.mock.calls as [{ dedupeKey: string }][])
        .filter(([input]) => input.dedupeKey.endsWith(':customer'))
        .map(([input]) => input.dedupeKey),
    );

    // Five calls, ONE distinct key each — the outbox's own dedupe swallow
    // (task-1) is what turns this into one actual message; this proves this
    // service's half of the contract: the key never varies run to run.
    expect(outboxService.enqueue).toHaveBeenCalledTimes(10);
    expect(technicianKeys.size).toBe(1);
    expect(customerKeys.size).toBe(1);
    expect([...technicianKeys][0]).toBe('maint:contract-1:2026-08-11:technician');
    expect([...customerKeys][0]).toBe('maint:contract-1:2026-08-11:customer');
  });
});

describe('MaintenanceReminderService — in-app notification repeat-run safety', () => {
  it('running the cron on three consecutive days (same contract, same window) creates only ONE in-app notification', async () => {
    const { service, notificationsRepository } = build([contract()]);
    // A real in-memory fake, not a static stub — proves notifySafely's
    // check-then-insert actually suppresses the 2nd/3rd create(), not just
    // that it calls existsByLinkPath.
    const created = new Set<string>();
    (notificationsRepository.existsByLinkPath as jest.Mock).mockImplementation(
      (_t: string, userId: string, type: string, linkPath: string) =>
        Promise.resolve(created.has(`${userId}:${type}:${linkPath}`)),
    );
    (notificationsRepository.create as jest.Mock).mockImplementation(
      (_t: string, _c: string | null, dto: { userId: string; type: string; linkPath: string }) => {
        created.add(`${dto.userId}:${dto.type}:${dto.linkPath}`);
        return Promise.resolve({});
      },
    );

    await service.runDailyReminders();
    await service.runDailyReminders();
    await service.runDailyReminders();

    expect(notificationsRepository.create).toHaveBeenCalledTimes(1);
  });

  // C3: the test above alone can't see this bug — it runs the cron three
  // times against the SAME nextServiceAt, which is supposed to dedupe. This
  // one varies nextServiceAt between runs, standing in for the same contract
  // coming due again next month — linkPath must carry nextServiceAt or the
  // September notification suppresses every cycle after it, forever.
  it('varying nextServiceAt between runs (a new maintenance cycle) creates a NEW notification each time, not just the first', async () => {
    const { service, remindersRepository, notificationsRepository } = build([contract()]);
    const created = new Set<string>();
    (notificationsRepository.existsByLinkPath as jest.Mock).mockImplementation(
      (_t: string, userId: string, type: string, linkPath: string) =>
        Promise.resolve(created.has(`${userId}:${type}:${linkPath}`)),
    );
    (notificationsRepository.create as jest.Mock).mockImplementation(
      (_t: string, _c: string | null, dto: { userId: string; type: string; linkPath: string }) => {
        created.add(`${dto.userId}:${dto.type}:${dto.linkPath}`);
        return Promise.resolve({});
      },
    );

    remindersRepository.listDueContracts
      .mockResolvedValueOnce({ windowDays: 3, contracts: [contract({ nextServiceAt: '2026-09-11' })] })
      .mockResolvedValueOnce({ windowDays: 3, contracts: [contract({ nextServiceAt: '2026-10-11' })] })
      .mockResolvedValueOnce({ windowDays: 3, contracts: [contract({ nextServiceAt: '2026-11-11' })] });

    await service.runDailyReminders();
    await service.runDailyReminders();
    await service.runDailyReminders();

    const linkPaths = (
      notificationsRepository.create as jest.Mock
    ).mock.calls.map(([, , dto]: [string, string | null, { linkPath: string }]) => dto.linkPath);
    expect(notificationsRepository.create).toHaveBeenCalledTimes(3);
    expect(new Set(linkPaths).size).toBe(3);
    expect(linkPaths).toEqual([
      '/maintenance?contract=contract-1&due=2026-09-11',
      '/maintenance?contract=contract-1&due=2026-10-11',
      '/maintenance?contract=contract-1&due=2026-11-11',
    ]);
  });
});

describe('MaintenanceReminderService.notifyBreakdownAssigned', () => {
  const assignmentInfo = (assignedUserId: string | null) => ({
    title: 'Elevator stuck between floors',
    severity: 'CRITICAL',
    assignedUserId,
    assetName: 'Elevator 2',
    customerName: 'Addis Heights PLC',
    technicianPhone: '+251949922604',
    technicianSmsConsentAt: new Date('2026-01-01T00:00:00Z'),
  });

  it('reassigning to the SAME technician computes the SAME dedupeKey', async () => {
    const { service, remindersRepository, outboxService } = build([]);
    remindersRepository.getBreakdownAssignmentInfo.mockResolvedValue(
      assignmentInfo('tech-1'),
    );

    await service.notifyBreakdownAssigned(TENANT_ID, 'bd-1');
    await service.notifyBreakdownAssigned(TENANT_ID, 'bd-1');

    const keys = (outboxService.enqueue.mock.calls as [{ dedupeKey: string }][]).map(
      ([input]) => input.dedupeKey,
    );
    expect(keys).toEqual(['breakdown:bd-1:tech-1', 'breakdown:bd-1:tech-1']);
  });

  it('reassigning to a DIFFERENT technician computes a DIFFERENT dedupeKey', async () => {
    const { service, remindersRepository, outboxService } = build([]);
    remindersRepository.getBreakdownAssignmentInfo
      .mockResolvedValueOnce(assignmentInfo('tech-1'))
      .mockResolvedValueOnce(assignmentInfo('tech-2'));

    await service.notifyBreakdownAssigned(TENANT_ID, 'bd-1');
    await service.notifyBreakdownAssigned(TENANT_ID, 'bd-1');

    const keys = (outboxService.enqueue.mock.calls as [{ dedupeKey: string }][]).map(
      ([input]) => input.dedupeKey,
    );
    expect(keys).toEqual(['breakdown:bd-1:tech-1', 'breakdown:bd-1:tech-2']);
  });

  it('no-ops (no SMS, no notification) when the breakdown has no assignee', async () => {
    const { service, remindersRepository, outboxService, notificationsRepository } = build([]);
    remindersRepository.getBreakdownAssignmentInfo.mockResolvedValue(
      assignmentInfo(null),
    );

    await service.notifyBreakdownAssigned(TENANT_ID, 'bd-1');

    expect(outboxService.enqueue).not.toHaveBeenCalled();
    expect(notificationsRepository.create).not.toHaveBeenCalled();
  });

  it('skips the SMS (consent gate) but still creates the in-app notification', async () => {
    const { service, remindersRepository, outboxService, notificationsRepository } = build([]);
    remindersRepository.getBreakdownAssignmentInfo.mockResolvedValue({
      ...assignmentInfo('tech-1'),
      technicianSmsConsentAt: null,
    });

    await service.notifyBreakdownAssigned(TENANT_ID, 'bd-1');

    expect(outboxService.enqueue).not.toHaveBeenCalled();
    expect(notificationsRepository.create).toHaveBeenCalledWith(
      TENANT_ID,
      null,
      expect.objectContaining({ userId: 'tech-1', type: 'ASSIGNMENT' }),
    );
  });
});

describe('MaintenanceReminderService — SMS/in-app independence (task-2 §2.4)', () => {
  it('an SMS enqueue failure does not prevent the in-app notification', async () => {
    const { service, outboxService, notificationsRepository } = build([contract()]);
    outboxService.enqueue.mockRejectedValue(new Error('provider down'));

    await expect(service.runDailyReminders()).resolves.toBeUndefined();

    expect(notificationsRepository.create).toHaveBeenCalledWith(
      TENANT_ID,
      null,
      expect.objectContaining({ userId: 'tech-1' }),
    );
  });

  it('an in-app notification failure does not prevent the SMS enqueue', async () => {
    const { service, outboxService, notificationsRepository } = build([contract()]);
    notificationsRepository.create.mockRejectedValue(new Error('recipient inactive'));

    await expect(service.runDailyReminders()).resolves.toBeUndefined();

    expect(outboxService.enqueue).toHaveBeenCalledTimes(2);
  });
});
