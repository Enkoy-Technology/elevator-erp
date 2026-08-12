import { NotificationsRepository } from './notifications.repository';

// existsByLinkPath is this table's stand-in for a dedupeKey (task-2 brief
// §2.4) — system-generated reminders (the daily maintenance cron) key their
// own repeat-run idempotency off it since `notifications` has no dedupeKey
// column of its own.

type Row = Record<string, unknown>;

const makeSelectChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

describe('NotificationsRepository.existsByLinkPath', () => {
  it('returns true when a matching (userId, type, linkPath) row already exists', async () => {
    const select = jest.fn(() => makeSelectChain([{ id: 'n1' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new NotificationsRepository({ withTenant } as never);

    await expect(
      repo.existsByLinkPath(TENANT_ID, USER_ID, 'MAINTENANCE', '/maintenance?contract=c1'),
    ).resolves.toBe(true);
  });

  it('returns false when no matching row exists', async () => {
    const select = jest.fn(() => makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new NotificationsRepository({ withTenant } as never);

    await expect(
      repo.existsByLinkPath(TENANT_ID, USER_ID, 'MAINTENANCE', '/maintenance?contract=c1'),
    ).resolves.toBe(false);
  });
});
