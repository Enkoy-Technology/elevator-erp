import { InvalidPhoneNumberError, SmsConsentRequiredError } from '../../common/exceptions';
import type { DuePaymentReminder } from './payment-reminders.repository';
import { PaymentReminderService } from './payment-reminders.service';

const TENANT_ID = 't1';

const dueInvoice = (
  overrides: Partial<DuePaymentReminder> = {},
): DuePaymentReminder => ({
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-0001',
  dueDate: '2026-08-08',
  outstandingEtb: '1234.50',
  offsetDays: 0,
  customerId: 'cust-1',
  customerName: 'Addis Heights PLC',
  customerPhone: '+251949922604',
  customerSmsConsentAt: new Date('2026-01-01T00:00:00Z'),
  customerSmsConsentRevokedAt: null,
  ...overrides,
});

/** Same real-consent-refusal stand-in as maintenance-reminders.service.spec.ts's own `build()` — see its doc comment (I3). */
const build = (dueInvoices: DuePaymentReminder[]) => {
  const tenantDirectory = { listActiveTenantIds: jest.fn(async () => [TENANT_ID]) };
  const remindersRepository = {
    listDueInvoices: jest.fn(async () => dueInvoices),
    recordRunResult: jest.fn(),
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

  const service = new PaymentReminderService(
    tenantDirectory as never,
    remindersRepository as never,
    outboxService as never,
  );
  return { service, tenantDirectory, remindersRepository, outboxService };
};

describe('PaymentReminderService.runDailyReminders — consent gate', () => {
  it('attempts but does not deliver an SMS for a customer with no smsConsentAt, and records the skip count for GET /settings (task-3 §3.4)', async () => {
    const { service, outboxService, remindersRepository } = build([
      dueInvoice({ customerSmsConsentAt: null }),
    ]);

    await service.runDailyReminders();

    expect(outboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ consentAt: null }),
    );
    expect(remindersRepository.recordRunResult).toHaveBeenCalledWith(TENANT_ID, 1, 0);
  });

  // I10: revoked consent must block just as hard as never having consented.
  it('attempts but does not deliver an SMS for a customer whose consent was revoked', async () => {
    const { service, outboxService, remindersRepository } = build([
      dueInvoice({ customerSmsConsentRevokedAt: new Date('2026-02-01T00:00:00Z') }),
    ]);

    await service.runDailyReminders();

    expect(outboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ consentAt: null }),
    );
    expect(remindersRepository.recordRunResult).toHaveBeenCalledWith(TENANT_ID, 1, 0);
  });

  it('enqueues for a customer with consent on file', async () => {
    const { service, outboxService } = build([dueInvoice()]);

    await service.runDailyReminders();

    expect(outboxService.enqueue).toHaveBeenCalledTimes(1);
    expect(outboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ consentAt: dueInvoice().customerSmsConsentAt }),
    );
  });

  it('skips a customer with no phone on file, without throwing', async () => {
    const { service, outboxService } = build([dueInvoice({ customerPhone: null })]);

    await expect(service.runDailyReminders()).resolves.toBeUndefined();
    expect(outboxService.enqueue).not.toHaveBeenCalled();
  });
});

// I4: an already-bad stored phone number is counted and surfaced, not just
// logged and forgotten.
describe('PaymentReminderService.runDailyReminders — invalid phone counter (I4)', () => {
  it('counts and records an InvalidPhoneNumberError separately from a consent skip', async () => {
    const { service, outboxService, remindersRepository } = build([dueInvoice()]);
    outboxService.enqueue.mockRejectedValueOnce(new InvalidPhoneNumberError('0911 2345'));

    await service.runDailyReminders();

    expect(remindersRepository.recordRunResult).toHaveBeenCalledWith(TENANT_ID, 0, 1);
  });
});

describe('PaymentReminderService.runDailyReminders — dedupeKey and money formatting', () => {
  it('the dedupeKey is stable per invoice per offset — repeated runs never drift', async () => {
    const { service, outboxService } = build([dueInvoice({ offsetDays: 7 })]);

    await service.runDailyReminders();
    await service.runDailyReminders();

    const keys = (outboxService.enqueue.mock.calls as unknown as [{ dedupeKey: string }][]).map(
      ([input]) => input.dedupeKey,
    );
    expect(keys).toEqual(['invoice-due:inv-1:7', 'invoice-due:inv-1:7']);
  });

  it('two different offsets for the SAME invoice get two different dedupeKeys — both fire', async () => {
    const { service, outboxService } = build([
      dueInvoice({ offsetDays: 0 }),
      dueInvoice({ offsetDays: 7 }),
    ]);

    await service.runDailyReminders();

    const keys = (outboxService.enqueue.mock.calls as unknown as [{ dedupeKey: string }][]).map(
      ([input]) => input.dedupeKey,
    );
    expect(keys.sort()).toEqual(['invoice-due:inv-1:0', 'invoice-due:inv-1:7']);
  });

  it('renders money through the shared formatter (comma-grouped, 2dp, ETB suffix) — never a raw Number()', async () => {
    const { service, outboxService } = build([
      dueInvoice({ outstandingEtb: '12345.60' }),
    ]);

    await service.runDailyReminders();

    const [input] = outboxService.enqueue.mock.calls[0] as unknown as [{ body: string }];
    expect(input.body).toContain('12,345.60 ETB');
  });
});

describe('PaymentReminderService — resilience', () => {
  it('an enqueue failure for one invoice does not stop the rest of the batch', async () => {
    const { service, outboxService } = build([
      dueInvoice({ invoiceId: 'inv-1' }),
      dueInvoice({ invoiceId: 'inv-2' }),
    ]);
    outboxService.enqueue
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce({} as never);

    await expect(service.runDailyReminders()).resolves.toBeUndefined();
    expect(outboxService.enqueue).toHaveBeenCalledTimes(2);
  });

  it('a tenant whose repository call throws does not stop other tenants from being processed', async () => {
    const { service, tenantDirectory, remindersRepository, outboxService } = build([]);
    tenantDirectory.listActiveTenantIds.mockResolvedValue(['bad-tenant', TENANT_ID]);
    remindersRepository.listDueInvoices
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce([dueInvoice()]);

    await expect(service.runDailyReminders()).resolves.toBeUndefined();
    expect(outboxService.enqueue).toHaveBeenCalledTimes(1);
  });
});
