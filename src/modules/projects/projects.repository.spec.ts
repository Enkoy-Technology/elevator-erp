import { normalizeEthiopic } from '../../common/text/ethiopic-normalize';
import { ProjectsRepository } from './projects.repository';

// Mirrors the Ethiopic-normalization coverage in
// customers.repository.spec.ts. Projects have no name-search or name-update
// endpoint today (see task-5-brief.md and task-5-report.md), so create() is
// the only write path that needs to populate nameNormalized.

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

describe('ProjectsRepository.create — Ethiopic-normalized write', () => {
  it('stores normalizeEthiopic(name) in nameNormalized alongside the original name', async () => {
    let captured: Record<string, unknown> = {};
    const insertChain: Record<string, jest.Mock> = {};
    insertChain.values = jest.fn((v: Record<string, unknown>) => {
      captured = v;
      return insertChain;
    });
    insertChain.returning = jest.fn(() =>
      Promise.resolve([{ id: 'p1' }]),
    );
    const insert = jest.fn(() => insertChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ insert }),
    );
    const repo = new ProjectsRepository({ withTenant } as never);

    await repo.create(TENANT_ID, 'creator-id', {
      customerId: 'c1',
      name: 'ሠራተኛ Elevator Install',
    });

    expect(captured.name).toBe('ሠራተኛ Elevator Install');
    expect(captured.nameNormalized).toBe(
      normalizeEthiopic('ሠራተኛ Elevator Install'),
    );
    expect(captured.nameNormalized).toBe('ሰራተኛ elevator install');
  });
});
