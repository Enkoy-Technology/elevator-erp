import type { OutboxDispatcherRepository } from './outbox-dispatcher.repository';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import type { OutboundMessageRecord } from './outbox.repository';
import type { SmsProvider } from './providers/sms-provider.interface';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

const message = (overrides: Partial<OutboundMessageRecord> = {}): OutboundMessageRecord => ({
  tenantId: TENANT_ID,
  id: 'm1',
  channel: 'SMS',
  recipient: '+251911234567',
  body: 'hi',
  status: 'SENDING',
  attempts: 1,
  nextAttemptAt: new Date(),
  lastError: null,
  dedupeKey: 'k1',
  providerMessageId: null,
  providerName: null,
  sentAt: null,
  createdByUserId: null,
  subjectKind: null,
  subjectId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeRepository = (claimed: OutboundMessageRecord[]) => ({
  claimDue: jest.fn(async (_limit: number) => claimed),
  markSent: jest.fn(
    async (_tenantId: string, _id: string, _providerMessageId: string, _providerName: string) =>
      undefined,
  ),
  markRetry: jest.fn(
    async (_tenantId: string, _id: string, _nextAttemptAt: Date, _lastError: string) => undefined,
  ),
  markFailed: jest.fn(async (_tenantId: string, _id: string, _lastError: string) => undefined),
});

const build = (
  claimed: OutboundMessageRecord[],
  send: jest.Mock,
) => {
  const repository = makeRepository(claimed);
  const provider: SmsProvider = { name: 'noop', send };
  const service = new OutboxDispatcherService(
    repository as unknown as OutboxDispatcherRepository,
    provider,
  );
  return { service, repository };
};

describe('OutboxDispatcherService.dispatch', () => {
  it('sends each claimed message and marks it SENT with the provider result', async () => {
    const send = jest.fn(async () => ({ providerMessageId: 'sms-123' }));
    const { service, repository } = build([message()], send);

    await service.dispatch();

    expect(send).toHaveBeenCalledWith('+251911234567', 'hi');
    expect(repository.markSent).toHaveBeenCalledWith(TENANT_ID, 'm1', 'sms-123', 'noop');
    expect(repository.markRetry).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('a provider that throws marks the message QUEUED with the next backoff, and dispatch() does not throw', async () => {
    const send = jest.fn(async () => {
      throw new Error('provider unavailable');
    });
    const { service, repository } = build([message({ attempts: 1 })], send);

    await expect(service.dispatch()).resolves.toBeUndefined();

    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(repository.markRetry).toHaveBeenCalledTimes(1);
    const [tenantId, id, nextAttemptAt, lastError] = repository.markRetry.mock.calls[0]!;
    expect(tenantId).toBe(TENANT_ID);
    expect(id).toBe('m1');
    expect(lastError).toBe('provider unavailable');
    // attempts=1 -> 1 minute backoff (outbox-backoff.spec.ts covers the full table).
    expect((nextAttemptAt).getTime()).toBeGreaterThan(Date.now() + 59_000);
    expect((nextAttemptAt).getTime()).toBeLessThan(Date.now() + 61_000);
  });

  it('the 4th failed attempt marks FAILED instead of scheduling another retry', async () => {
    const send = jest.fn(async () => {
      throw new Error('still down');
    });
    const { service, repository } = build([message({ attempts: 4 })], send);

    await service.dispatch();

    expect(repository.markRetry).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(TENANT_ID, 'm1', 'still down');
  });

  it('one message throwing does not stop the rest of the claimed batch from being processed', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ providerMessageId: 'sms-2' });
    const { service, repository } = build(
      [message({ id: 'm1', attempts: 1 }), message({ id: 'm2', attempts: 1 })],
      send,
    );

    await service.dispatch();

    expect(repository.markRetry).toHaveBeenCalledWith(
      TENANT_ID,
      'm1',
      expect.any(Date),
      'boom',
    );
    expect(repository.markSent).toHaveBeenCalledWith(TENANT_ID, 'm2', 'sms-2', 'noop');
  });

  it('a claimDue failure is caught and logged, not thrown — the scheduler must survive a DB blip', async () => {
    const send = jest.fn();
    const { service, repository } = build([], send);
    repository.claimDue.mockRejectedValueOnce(new Error('connection reset'));

    await expect(service.dispatch()).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('an EMAIL message (no provider wired yet) is treated as a failure and backed off, not sent', async () => {
    const send = jest.fn();
    const { service, repository } = build([message({ channel: 'EMAIL', attempts: 1 })], send);

    await service.dispatch();

    expect(send).not.toHaveBeenCalled();
    expect(repository.markRetry).toHaveBeenCalledWith(
      TENANT_ID,
      'm1',
      expect.any(Date),
      expect.stringContaining('EMAIL'),
    );
  });
});
