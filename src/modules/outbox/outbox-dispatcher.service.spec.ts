import type { OutboxDispatcherRepository } from './outbox-dispatcher.repository';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import type { OutboundMessageRecord } from './outbox.repository';
import type { SmsProvider } from './providers/sms-provider.interface';
import type { SmsAllowlistRuntimeConfig } from './sms-allowlist';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
// The client's own test handset — the only phone number allowed in this
// codebase's fixtures/specs/docs (task-3 brief §3.0 SAFETY).
const TEST_PHONE = '+251949922604';
// Never enforced by default here: build()'s default allowlistConfig is
// empty + 'test', which smsAllowlistBlockReason never blocks (branch 2) —
// existing tests above prove ordinary send/retry/backoff behaviour
// unaffected by the guard rail's mere presence. The allowlist-specific
// describe block below overrides allowlistConfig to prove the other three
// branches.

const message = (overrides: Partial<OutboundMessageRecord> = {}): OutboundMessageRecord => ({
  tenantId: TENANT_ID,
  id: 'm1',
  channel: 'SMS',
  recipient: TEST_PHONE,
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

const NEVER_BLOCKS_ALLOWLIST: SmsAllowlistRuntimeConfig = { nodeEnv: 'test', allowlist: [] };

const build = (
  claimed: OutboundMessageRecord[],
  send: jest.Mock,
  allowlistConfig: SmsAllowlistRuntimeConfig = NEVER_BLOCKS_ALLOWLIST,
) => {
  const repository = makeRepository(claimed);
  const provider: SmsProvider = { name: 'noop', send };
  const service = new OutboxDispatcherService(
    repository as unknown as OutboxDispatcherRepository,
    provider,
    allowlistConfig,
  );
  return { service, repository };
};

describe('OutboxDispatcherService.dispatch', () => {
  it('sends each claimed message and marks it SENT with the provider result', async () => {
    const send = jest.fn(async () => ({ providerMessageId: 'sms-123' }));
    const { service, repository } = build([message()], send);

    await service.dispatch();

    expect(send).toHaveBeenCalledWith(TEST_PHONE, 'hi');
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

  it('C1: a successful send whose markSent write-back throws does NOT retry or re-send — the row is left stranded in SENDING instead', async () => {
    const send = jest.fn(async () => ({ providerMessageId: 'sms-123' }));
    const { service, repository } = build([message()], send);
    repository.markSent.mockRejectedValueOnce(new Error('connection reset'));

    await expect(service.dispatch()).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    // The whole point: markSent failing must NOT fall through to the
    // retry/backoff or FAILED paths — either would put the message back
    // where the next tick sends it again, duplicating an SMS that already
    // reached a real customer.
    expect(repository.markRetry).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
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

// task-3 brief §3.0 SAFETY: "Test all four branches" — this describe block
// proves the dispatcher actually wires smsAllowlistBlockReason's decision
// into real behaviour (never calls the provider when blocked; goes straight
// to FAILED, visibly, not silent and not through the retry/backoff path).
// sms-allowlist.spec.ts already proves the pure decision function itself;
// env.schema.spec.ts proves the boot-time refusal branch.
describe('OutboxDispatcherService.dispatch — the SMS_ALLOWLIST guard rail', () => {
  const NOT_ALLOWLISTED = 'not-allowlisted-recipient';

  it('a recipient on the allowlist sends normally (branch: non-production, listed)', async () => {
    const send = jest.fn(async () => ({ providerMessageId: 'sms-1' }));
    const { service, repository } = build([message({ recipient: TEST_PHONE })], send, {
      nodeEnv: 'development',
      allowlist: [TEST_PHONE],
    });

    await service.dispatch();

    expect(send).toHaveBeenCalledWith(TEST_PHONE, 'hi');
    expect(repository.markSent).toHaveBeenCalledWith(TENANT_ID, 'm1', 'sms-1', 'noop');
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('a recipient NOT on the allowlist is blocked — never reaches the provider, marked FAILED immediately with a visible reason (branch: non-production, unlisted)', async () => {
    const send = jest.fn();
    const { service, repository } = build(
      [message({ recipient: NOT_ALLOWLISTED, attempts: 1 })],
      send,
      { nodeEnv: 'development', allowlist: [TEST_PHONE] },
    );

    await service.dispatch();

    expect(send).not.toHaveBeenCalled();
    expect(repository.markRetry).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledTimes(1);
    const [tenantId, id, lastError] = repository.markFailed.mock.calls[0]!;
    expect(tenantId).toBe(TENANT_ID);
    expect(id).toBe('m1');
    expect(lastError).toContain('SMS_ALLOWLIST');
    expect(lastError).toContain(NOT_ALLOWLISTED);
  });

  it('an empty allowlist blocks nothing (branch: non-production, empty — only reachable with SMS_PROVIDER=noop)', async () => {
    const send = jest.fn(async () => ({ providerMessageId: 'sms-1' }));
    const { service, repository } = build([message({ recipient: NOT_ALLOWLISTED })], send, {
      nodeEnv: 'development',
      allowlist: [],
    });

    await service.dispatch();

    expect(send).toHaveBeenCalledWith(NOT_ALLOWLISTED, 'hi');
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('production ignores the allowlist entirely, even for an unlisted recipient (branch: production)', async () => {
    const send = jest.fn(async () => ({ providerMessageId: 'sms-1' }));
    const { service, repository } = build([message({ recipient: NOT_ALLOWLISTED })], send, {
      nodeEnv: 'production',
      allowlist: [TEST_PHONE],
    });

    await service.dispatch();

    expect(send).toHaveBeenCalledWith(NOT_ALLOWLISTED, 'hi');
    expect(repository.markFailed).not.toHaveBeenCalled();
  });
});
