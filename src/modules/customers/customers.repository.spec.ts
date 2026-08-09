import { NotFoundException } from '@nestjs/common';

import { CustomerInUseError } from '../../common/exceptions';
import { normalizeEthiopic } from '../../common/text/ethiopic-normalize';
import { CustomersRepository } from './customers.repository';

// The dependent-record guard and the soft-delete write both have to run in
// the same tenant transaction as the counts they depend on (see
// TenantDbService.withTenant), so — like the last-admin guard in
// EmployeesRepository — this is a repository-level test, not a service one.

type Row = Record<string, unknown>;

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';

const makeCountChain = (value: number) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => Promise.resolve([{ value }]));
  return chain;
};

const makeUpdateChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(rows));
  return chain;
};

/** Wires a fake tenant transaction: the three `select` calls (projects,
 * assets, maintenance contracts, in that order) resolve to `counts`, and the
 * `update` call resolves to `updateRows`. */
const repoWithTx = (counts: [number, number, number], updateRows: Row[]) => {
  const select = jest.fn();
  counts.forEach((value) => select.mockReturnValueOnce(makeCountChain(value)));
  const updateChain = makeUpdateChain(updateRows);
  const update = jest.fn(() => updateChain);
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select, update }),
  );
  const repo = new CustomersRepository({ withTenant } as never);
  return { repo, select, update, updateChain };
};

describe('CustomersRepository.softDelete — dependent-record guard', () => {
  it('refuses to delete a customer with linked projects, assets or contracts', async () => {
    const { repo, update } = repoWithTx([2, 1, 0], []);

    await expect(repo.softDelete(TENANT_ID, CUSTOMER_ID)).rejects.toThrow(
      'Cannot delete a customer with 2 linked project(s), 1 linked asset(s) and 0 linked maintenance contract(s).',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects with CustomerInUseError specifically', async () => {
    const { repo } = repoWithTx([0, 0, 1], []);

    await expect(
      repo.softDelete(TENANT_ID, CUSTOMER_ID),
    ).rejects.toBeInstanceOf(CustomerInUseError);
  });

  it('deletes a customer with no linked records', async () => {
    const { repo, updateChain } = repoWithTx(
      [0, 0, 0],
      [{ id: CUSTOMER_ID }],
    );

    await expect(
      repo.softDelete(TENANT_ID, CUSTOMER_ID),
    ).resolves.toBeUndefined();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });

  it('still 404s a customer that does not exist once dependents are clear', async () => {
    const { repo } = repoWithTx([0, 0, 0], []);

    await expect(
      repo.softDelete(TENANT_ID, CUSTOMER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// Pulls every literal string embedded in a drizzle SQL fragment's
// queryChunks (the tagged-template params), skipping the raw-text wrapper
// objects and columns. Verified against drizzle-orm's actual object shape
// in a throwaway script before writing these tests — see task-5-report.md.
const extractSqlLiterals = (fragment: unknown): string[] => {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'string') {
      out.push(x);
      return;
    }
    if (x && typeof x === 'object' && 'queryChunks' in x) {
      for (const chunk of (x as { queryChunks: unknown[] }).queryChunks) {
        walk(chunk);
      }
    }
  };
  walk(fragment);
  return out;
};

describe('CustomersRepository — Ethiopic-normalized write and search', () => {
  const makeInsertChain = (rows: Row[], captureValues: (v: unknown) => void) => {
    const chain: Record<string, jest.Mock> = {};
    chain.values = jest.fn((v: unknown) => {
      captureValues(v);
      return chain;
    });
    chain.returning = jest.fn(() => Promise.resolve(rows));
    return chain;
  };

  it('create() stores normalizeEthiopic(name) in nameNormalized alongside the original name', async () => {
    let captured: Record<string, unknown> = {};
    const insertChain = makeInsertChain(
      [{ id: CUSTOMER_ID, name: 'ሐይሉ Elevator PLC' }],
      (v) => (captured = v as Record<string, unknown>),
    );
    const insert = jest.fn(() => insertChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ insert }),
    );
    const repo = new CustomersRepository({ withTenant } as never);

    await repo.create(TENANT_ID, 'creator-id', {
      name: 'ሐይሉ Elevator PLC',
    });

    expect(captured.name).toBe('ሐይሉ Elevator PLC');
    expect(captured.nameNormalized).toBe(normalizeEthiopic('ሐይሉ Elevator PLC'));
    expect(captured.nameNormalized).toBe('ሀይሉ elevator plc');
  });

  it('update() re-derives nameNormalized whenever name changes, and omits both when it does not', async () => {
    const updateChain: Record<string, jest.Mock> = {};
    let captured: Record<string, unknown> = {};
    updateChain.set = jest.fn((v: Record<string, unknown>) => {
      captured = v;
      return updateChain;
    });
    updateChain.where = jest.fn(() => updateChain);
    updateChain.returning = jest.fn(() =>
      Promise.resolve([{ id: CUSTOMER_ID }]),
    );
    const update = jest.fn(() => updateChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update }),
    );
    const repo = new CustomersRepository({ withTenant } as never);

    await repo.update(TENANT_ID, CUSTOMER_ID, { name: 'ኀይሉ Trading' });
    expect(captured.name).toBe('ኀይሉ Trading');
    expect(captured.nameNormalized).toBe(normalizeEthiopic('ኀይሉ Trading'));

    await repo.update(TENANT_ID, CUSTOMER_ID, { city: 'Adama' });
    expect(captured).not.toHaveProperty('name');
    expect(captured).not.toHaveProperty('nameNormalized');
  });

  const makeListChains = (
    onCountWhere: (w: unknown) => void,
    onItemsWhere: (w: unknown) => void,
  ) => {
    const countChain: Record<string, jest.Mock> = {};
    countChain.from = jest.fn(() => countChain);
    countChain.where = jest.fn((w: unknown) => {
      onCountWhere(w);
      return Promise.resolve([{ value: 0 }]);
    });

    const itemsChain: Record<string, jest.Mock> = {};
    itemsChain.from = jest.fn(() => itemsChain);
    itemsChain.where = jest.fn((w: unknown) => {
      onItemsWhere(w);
      return itemsChain;
    });
    itemsChain.orderBy = jest.fn(() => itemsChain);
    itemsChain.limit = jest.fn(() => itemsChain);
    itemsChain.offset = jest.fn(() => Promise.resolve([]));

    const select = jest.fn();
    select.mockReturnValueOnce(countChain).mockReturnValueOnce(itemsChain);
    return { select };
  };

  it('list() searches nameNormalized with the query run through normalizeEthiopic, not the raw query', async () => {
    let where: unknown;
    const { select } = makeListChains(
      (w) => (where = w),
      () => {},
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new CustomersRepository({ withTenant } as never);

    // ኃይሉ (XAA order) should match a customer stored as ሃይሉ (HAA order) —
    // the whole point of this feature — so the query pattern embedded in
    // the WHERE clause must be the *normalized* form, not the raw one.
    await repo.list(TENANT_ID, { search: 'ኃይሉ' });

    // The email/phone leg deliberately keeps the old (merely-lowercased,
    // not homophone-folded) pattern per the brief — "only the name leg
    // changes" — so the RAW query (U+1283 ኃ, XAA order) is still expected
    // to show up for that leg, distinct from the name leg's NORMALIZED
    // pattern (U+1203 ሃ, HAA order — the two glyphs are easy to confuse by
    // eye, hence the \u escapes here rather than relying on the source
    // file's rendering).
    const literals = extractSqlLiterals(where);
    expect(literals).toContain(`%${normalizeEthiopic('ኃይሉ')}%`); // name leg: normalized
    expect(literals).toContain('%ሃይሉ%'); // ditto, spelled out: ሃይሉ
    expect(literals).toContain('%ኃይሉ%'); // email/phone leg: raw, ኃይሉ — would fail if normalizeEthiopic ever leaked into that leg
  });

  it('streamAll() applies the same normalized search leg as list()', async () => {
    let where: unknown;
    const countChain: Record<string, jest.Mock> = {};
    // streamAll has no count query — only the batch select.
    const itemsChain: Record<string, jest.Mock> = {};
    itemsChain.from = jest.fn(() => itemsChain);
    itemsChain.where = jest.fn((w: unknown) => {
      where = w;
      return itemsChain;
    });
    itemsChain.orderBy = jest.fn(() => itemsChain);
    itemsChain.limit = jest.fn(() => itemsChain);
    itemsChain.offset = jest.fn(() => Promise.resolve([]));
    const select = jest.fn(() => itemsChain);
    void countChain;

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new CustomersRepository({ withTenant } as never);

    const gen = repo.streamAll(TENANT_ID, { search: 'ኃይሉ' });
    await gen.next();

    const literals = extractSqlLiterals(where);
    expect(literals).toContain('%ሃይሉ%');
  });

  it('findSimilar() compares nameNormalized in both directions using the normalized needle', async () => {
    let where: unknown;
    const selectChain: Record<string, jest.Mock> = {};
    selectChain.from = jest.fn(() => selectChain);
    selectChain.where = jest.fn((w: unknown) => {
      where = w;
      return selectChain;
    });
    selectChain.orderBy = jest.fn(() => selectChain);
    selectChain.limit = jest.fn(() => Promise.resolve([]));
    const select = jest.fn(() => selectChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new CustomersRepository({ withTenant } as never);

    await repo.findSimilar(TENANT_ID, 'ኀይሉ Trading');

    const literals = extractSqlLiterals(where);
    expect(literals).toContain(`%${normalizeEthiopic('ኀይሉ Trading')}%`);
    expect(literals.some((l) => l.includes('ኀይሉ'))).toBe(false);
  });
});
