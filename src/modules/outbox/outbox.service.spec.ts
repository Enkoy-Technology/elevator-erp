import { InvalidPhoneNumberError } from '../../common/exceptions';
import type { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

describe('OutboxService.enqueue', () => {
  it('normalises an SMS recipient to E.164 before handing off to the repository', async () => {
    const enqueue = jest.fn(async (_tenantId: string, values: unknown) => ({
      id: 'm1',
      ...(values as object),
    }));
    const service = new OutboxService({ enqueue } as unknown as OutboxRepository);

    await service.enqueue({
      tenantId: TENANT_ID,
      channel: 'SMS',
      recipient: '0911234567',
      body: 'hi',
      dedupeKey: 'k1',
    });

    expect(enqueue).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ recipient: '+251911234567' }),
    );
  });

  it('rejects an unrecognisable phone number before ever reaching the repository', async () => {
    const enqueue = jest.fn();
    const service = new OutboxService({ enqueue } as unknown as OutboxRepository);

    await expect(
      service.enqueue({
        tenantId: TENANT_ID,
        channel: 'SMS',
        recipient: 'not-a-phone',
        body: 'hi',
        dedupeKey: 'k1',
      }),
    ).rejects.toBeInstanceOf(InvalidPhoneNumberError);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('leaves an EMAIL recipient untouched (only trimmed) — phone normalisation is SMS-only', async () => {
    const enqueue = jest.fn(async (_tenantId: string, values: unknown) => ({
      id: 'm1',
      ...(values as object),
    }));
    const service = new OutboxService({ enqueue } as unknown as OutboxRepository);

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
});
