import { InvalidPhoneNumberError, SmsConsentRequiredError } from '../../common/exceptions';
import type { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const CONSENT_AT = new Date('2026-01-01T00:00:00Z');

describe('OutboxService.enqueue', () => {
  it('normalises an SMS recipient to E.164 before handing off to the repository', async () => {
    const enqueue = jest.fn(async (_tenantId: string, values: unknown) => ({
      id: 'm1',
      ...(values as object),
    }));
    const service = new OutboxService(
      { enqueue } as unknown as OutboxRepository,
      { name: 'noop' } as never,
    );

    await service.enqueue({
      tenantId: TENANT_ID,
      channel: 'SMS',
      recipient: '0949922604',
      body: 'hi',
      dedupeKey: 'k1',
      consentAt: CONSENT_AT,
    });

    expect(enqueue).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ recipient: '+251949922604' }),
    );
  });

  it('rejects an unrecognisable phone number before ever reaching the repository', async () => {
    const enqueue = jest.fn();
    const service = new OutboxService(
      { enqueue } as unknown as OutboxRepository,
      { name: 'noop' } as never,
    );

    await expect(
      service.enqueue({
        tenantId: TENANT_ID,
        channel: 'SMS',
        recipient: 'not-a-phone',
        body: 'hi',
        dedupeKey: 'k1',
        consentAt: CONSENT_AT,
      }),
    ).rejects.toBeInstanceOf(InvalidPhoneNumberError);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('leaves an EMAIL recipient untouched (only trimmed) — phone normalisation is SMS-only', async () => {
    const enqueue = jest.fn(async (_tenantId: string, values: unknown) => ({
      id: 'm1',
      ...(values as object),
    }));
    const service = new OutboxService(
      { enqueue } as unknown as OutboxRepository,
      { name: 'noop' } as never,
    );

    await service.enqueue({
      tenantId: TENANT_ID,
      channel: 'EMAIL',
      recipient: '  ops@example.com  ',
      body: 'hi',
      dedupeKey: 'k1',
    });

    expect(enqueue).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ recipient: 'ops@example.com' }),
    );
  });

  // I3: the choke point itself refuses, so a caller that forgets to check
  // canSmsRecipient can no longer accidentally send.
  describe('consent enforcement (I3)', () => {
    it('refuses an SMS with consentAt null before ever reaching the repository', async () => {
      const enqueue = jest.fn();
      const service = new OutboxService(
        { enqueue } as unknown as OutboxRepository,
        { name: 'noop' } as never,
      );

      await expect(
        service.enqueue({
          tenantId: TENANT_ID,
          channel: 'SMS',
          recipient: '+251949922604',
          body: 'hi',
          dedupeKey: 'k1',
          consentAt: null,
        }),
      ).rejects.toBeInstanceOf(SmsConsentRequiredError);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('never embeds the recipient in the rejection message — nothing to mask, nothing to leak', async () => {
      const service = new OutboxService(
        {} as unknown as OutboxRepository,
        { name: 'noop' } as never,
      );

      await expect(
        service.enqueue({
          tenantId: TENANT_ID,
          channel: 'SMS',
          recipient: '+251949922604',
          body: 'hi',
          dedupeKey: 'k1',
          consentAt: null,
        }),
      ).rejects.toThrow(/no consent on file/);
    });

    it('proceeds when consentAt is set', async () => {
      const enqueue = jest.fn(async (_tenantId: string, values: unknown) => ({
        id: 'm1',
        ...(values as object),
      }));
      const service = new OutboxService(
        { enqueue } as unknown as OutboxRepository,
        { name: 'noop' } as never,
      );

      await service.enqueue({
        tenantId: TENANT_ID,
        channel: 'SMS',
        recipient: '+251949922604',
        body: 'hi',
        dedupeKey: 'k1',
        consentAt: CONSENT_AT,
      });

      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });

  // I5: segmentsFor was dead code — enqueue is now its one production
  // caller, warning above 2 segments so a template that would double/triple
  // the bill is visible in the logs before anyone notices on an invoice.
  describe('segment cost warning (I5)', () => {
    it('warns when a body needs more than 2 segments', async () => {
      const service = new OutboxService(
        { enqueue: jest.fn(async () => ({ id: 'm1' })) } as unknown as OutboxRepository,
        { name: 'noop' } as never,
      );
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: (...a: unknown[]) => void } }).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.enqueue({
        tenantId: TENANT_ID,
        channel: 'SMS',
        recipient: '+251949922604',
        body: 'A'.repeat(153 * 3 + 1), // 4 GSM-7 segments — same fixture as sms-segments.spec.ts
        dedupeKey: 'k1',
        consentAt: CONSENT_AT,
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('4 segments');
    });

    it('does not warn for a body that fits in 1-2 segments', async () => {
      const service = new OutboxService(
        { enqueue: jest.fn(async () => ({ id: 'm1' })) } as unknown as OutboxRepository,
        { name: 'noop' } as never,
      );
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: (...a: unknown[]) => void } }).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.enqueue({
        tenantId: TENANT_ID,
        channel: 'SMS',
        recipient: '+251949922604',
        body: 'Your payment is due tomorrow.',
        dedupeKey: 'k1',
        consentAt: CONSENT_AT,
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe('OutboxService.getSmsProviderName', () => {
  it('reports the wired-up provider\'s own name — "noop" means nothing really sends (task-3 §3.3)', () => {
    const service = new OutboxService(
      {} as unknown as OutboxRepository,
      { name: 'afromessage' } as never,
    );
    expect(service.getSmsProviderName()).toBe('afromessage');
  });
});

// I5: segments surfaced as a column in the message log UI + its CSV/XLSX
// export, so the cost is visible before the bill arrives.
describe('OutboxService.list / streamAll — segments column (I5)', () => {
  const user = { userId: 'u1', tenantId: TENANT_ID, role: 'ADMIN' } as never;
  const row = { id: 'm1', body: 'A'.repeat(200), channel: 'SMS' as const };

  it('list() attaches the computed segment count to each row', async () => {
    const repository = {
      list: jest.fn(async () => ({
        items: [row],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      })),
    };
    const service = new OutboxService(repository as unknown as OutboxRepository, {
      name: 'noop',
    } as never);

    const result = await service.list(user, {});

    expect(result.items[0]?.segments).toBe(2);
  });

  it('streamAll() attaches the computed segment count to each yielded row', async () => {
    const repository = {
      streamAll: jest.fn(async function* () {
        yield row;
      }),
    };
    const service = new OutboxService(repository as unknown as OutboxRepository, {
      name: 'noop',
    } as never);

    const items = [];
    for await (const item of service.streamAll(user, {})) {
      items.push(item);
    }

    expect(items).toHaveLength(1);
    expect(items[0]?.segments).toBe(2);
  });
});
