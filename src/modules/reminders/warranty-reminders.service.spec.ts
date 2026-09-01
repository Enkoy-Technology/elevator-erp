import { SmsConsentRequiredError } from '../../common/exceptions';
import type { DueWarrantyReminder } from './warranty-reminders.repository';
import { WarrantyReminderService } from './warranty-reminders.service';

const TENANT_ID = 't1';

const expiring = (
  overrides: Partial<DueWarrantyReminder> = {},
): DueWarrantyReminder => ({
  contractId: 'cnt-1',
  contractNumber: 'CNT-FY2026-27-0001',
  expiresOn: '2027-08-14',
  basis: 'HANDOVER',
  offsetDays: 30,
  customerId: 'cust-1',
  customerName: 'Addis Heights PLC',
  customerPhone: '+251949922604',
  customerSmsConsentAt: new Date('2026-01-01T00:00:00Z'),
  customerSmsConsentRevokedAt: null,
  ...overrides,
});

/** Same real-consent-refusal stand-in as payment-reminders.service.spec.ts. */
const build = (due: DueWarrantyReminder[]) => {
  const tenantDirectory = { listActiveTenantIds: jest.fn(async () => [TENANT_ID]) };
  const remindersRepository = {
    listExpiringWarranties: jest.fn(async () => due),
  };
  const outboxService = {
    enqueue: jest.fn(
      async (input: { channel: string; consentAt?: Date | null }) => {
        if (input.channel === 'SMS' && input.consentAt == null) {
          throw new SmsConsentRequiredError();
        }
        return input;
      },
    ),
  };
  const service = new WarrantyReminderService(
    tenantDirectory as never,
    remindersRepository as never,
    outboxService as never,
  );
  return { service, outboxService };
};

describe('WarrantyReminderService.runDailyReminders', () => {
  it('enqueues an SMS naming the contract and the expiry date', async () => {
    const { service, outboxService } = build([expiring()]);

    await service.runDailyReminders();

    expect(outboxService.enqueue).toHaveBeenCalledTimes(1);
    expect(outboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'SMS',
        subjectKind: 'CONTRACT',
        subjectId: 'cnt-1',
        dedupeKey: 'warranty-expiry:cnt-1:30',
        body: expect.stringContaining('CNT-FY2026-27-0001'),
      }),
    );
    expect(outboxService.enqueue.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ body: expect.stringContaining('2027-08-14') }),
    );
  });

  it('gives the 30-day and 7-day notices different dedupe keys', async () => {
    const { service, outboxService } = build([
      expiring({ offsetDays: 30 }),
      expiring({ offsetDays: 7 }),
    ]);

    await service.runDailyReminders();

    const keys = outboxService.enqueue.mock.calls.map(
      (call) => (call[0] as unknown as { dedupeKey: string }).dedupeKey,
    );
    expect(keys).toEqual(['warranty-expiry:cnt-1:30', 'warranty-expiry:cnt-1:7']);
  });

  it('hands the outbox a null consentAt for a customer who never consented', async () => {
    const { service, outboxService } = build([
      expiring({ customerSmsConsentAt: null }),
    ]);

    await service.runDailyReminders();

    expect(outboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ consentAt: null }),
    );
  });

  it('hands the outbox a null consentAt for a customer whose consent was revoked', async () => {
    const { service, outboxService } = build([
      expiring({ customerSmsConsentRevokedAt: new Date('2026-02-01T00:00:00Z') }),
    ]);

    await service.runDailyReminders();

    expect(outboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ consentAt: null }),
    );
  });

  it('skips a customer with no phone on file, without throwing', async () => {
    const { service, outboxService } = build([expiring({ customerPhone: null })]);

    await expect(service.runDailyReminders()).resolves.toBeUndefined();
    expect(outboxService.enqueue).not.toHaveBeenCalled();
  });
});
