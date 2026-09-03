import { OVERVIEW_SECTIONS } from './customer-overview';
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

/** Wires a fake `select({id, reversalOfPaymentId}).from(payments).where(...)` resolving to `rows`. */
const makePaymentsChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const makeUpdateChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(rows));
  return chain;
};

/** Wires a fake tenant transaction: the four `select` COUNT calls (projects,
 * assets, maintenance contracts, invoices, in that order) resolve to
 * `counts`, the fifth `select` (raw payment rows) resolves to `paymentRows`,
 * and the `update` call resolves to `updateRows`. */
const repoWithTx = (
  counts: [number, number, number, number],
  paymentRows: Row[],
  updateRows: Row[],
) => {
  const select = jest.fn();
  counts.forEach((value) => select.mockReturnValueOnce(makeCountChain(value)));
  select.mockReturnValueOnce(makePaymentsChain(paymentRows));
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
    const { repo, update } = repoWithTx([2, 1, 0, 0], [], []);

    await expect(repo.softDelete(TENANT_ID, CUSTOMER_ID)).rejects.toThrow(
      'Cannot delete a customer with 2 linked project(s), 1 linked asset(s), 0 linked maintenance contract(s), 0 linked invoice(s) and 0 linked payment(s).',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects with CustomerInUseError specifically', async () => {
    const { repo } = repoWithTx([0, 0, 1, 0], [], []);

    await expect(
      repo.softDelete(TENANT_ID, CUSTOMER_ID),
    ).rejects.toBeInstanceOf(CustomerInUseError);
  });

  // R5: a customer billed only via a standalone invoice has none of the
  // three prior checks, so it is the invoice count alone that must block
  // deletion here.
  it('R5: refuses to delete a customer with one open (non-VOID) invoice, even with no projects/assets/contracts', async () => {
    const { repo, update } = repoWithTx([0, 0, 0, 1], [], []);

    await expect(repo.softDelete(TENANT_ID, CUSTOMER_ID)).rejects.toThrow(
      'Cannot delete a customer with 0 linked project(s), 0 linked asset(s), 0 linked maintenance contract(s), 1 linked invoice(s) and 0 linked payment(s).',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('R5: refuses to delete a customer with a live (non-reversed) payment — unallocated advance cash has no invoice to be caught by the count above', async () => {
    const { repo, update } = repoWithTx(
      [0, 0, 0, 0],
      [{ id: 'pay-1', reversalOfPaymentId: null }],
      [],
    );

    await expect(repo.softDelete(TENANT_ID, CUSTOMER_ID)).rejects.toThrow(
      'Cannot delete a customer with 0 linked project(s), 0 linked asset(s), 0 linked maintenance contract(s), 0 linked invoice(s) and 1 linked payment(s).',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('R5: a fully-reversed payment pair (original + its reversal) nets to zero live payments and does not block deletion', async () => {
    const { repo, updateChain } = repoWithTx(
      [0, 0, 0, 0],
      [
        { id: 'pay-1', reversalOfPaymentId: null },
        { id: 'pay-2', reversalOfPaymentId: 'pay-1' },
      ],
      [{ id: CUSTOMER_ID }],
    );

    await expect(repo.softDelete(TENANT_ID, CUSTOMER_ID)).resolves.toBeUndefined();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });

  it('deletes a customer with no linked records', async () => {
    const { repo, updateChain } = repoWithTx(
      [0, 0, 0, 0],
      [],
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
    const { repo } = repoWithTx([0, 0, 0, 0], [], []);

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

// Pulls the column name out of a drizzle asc()/desc() SQL wrapper (same
// queryChunks shape extractSqlLiterals above walks for `sql` fragments) —
// used to assert the PK tiebreaker is actually present in orderBy() without
// needing a real column/table object.
const extractOrderByColumnNames = (arg: unknown): string[] => {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (!x || typeof x !== 'object') return;
    if ('name' in x && typeof (x as { name?: unknown }).name === 'string' && 'table' in x) {
      out.push((x as { name: string }).name);
    }
    if ('queryChunks' in x) {
      for (const chunk of (x as { queryChunks: unknown[] }).queryChunks) walk(chunk);
    }
  };
  walk(arg);
  return out;
};

describe('CustomersRepository.statement — Task 3 (3.7)', () => {
  /** A fake select chain that is also "thenable" at any step (same idiom as InvoicesRepository's own spec). */
  interface SelectChain {
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void;
  }
  const makeSelectChain = (rows: unknown[]): SelectChain => {
    const chain = {} as SelectChain;
    chain.from = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.then = (resolve, reject) => {
      Promise.resolve(rows).then(resolve, reject);
    };
    return chain;
  };

  it('404s when the customer does not exist, without querying invoices or payments', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new CustomersRepository({ withTenant } as never);

    await expect(
      repo.statement(TENANT_ID, CUSTOMER_ID, '2026-08-01', '2026-08-31'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('merges the invoice, payment and withholding legs into one settled statement (mirrors the full-settlement e2e: 115 invoice, 112 cash, 3 WHT nets to zero)', async () => {
    const midDayUtc = new Date('2026-08-08T09:00:00Z'); // 12:00 Addis (UTC+3) — same business day either way

    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: CUSTOMER_ID, name: 'Acme' }])) // customer lookup
      .mockReturnValueOnce(
        makeSelectChain([
          {
            id: 'inv-1',
            invoiceNumber: 'INV-0001',
            totalEtb: '115.00',
            whtEtb: '3.00',
            whtVoucherRef: 'WHT-0001',
            whtRecordedAt: midDayUtc,
            issuedAt: midDayUtc,
          },
        ]),
      ) // invoices leg
      .mockReturnValueOnce(
        makeSelectChain([
          {
            id: 'pay-1',
            receiptNumber: 'RCT-0001',
            amountEtb: '112.00',
            receivedAt: midDayUtc,
          },
        ]),
      ); // payments leg
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new CustomersRepository({ withTenant } as never);

    const result = await repo.statement(TENANT_ID, CUSTOMER_ID, '2026-08-01', '2026-08-31');

    expect(result.customerId).toBe(CUSTOMER_ID);
    expect(result.customerName).toBe('Acme');
    expect(result.openingBalance).toBe('0.00');
    expect(result.closingBalance).toBe('0.00');
    expect(result.rows.map((r) => r.kind)).toEqual(['invoice', 'payment', 'withholding']);
    expect(result.rows.map((r) => r.reference)).toEqual(['INV-0001', 'RCT-0001', 'WHT-0001']);
  });
});

describe('CustomersRepository.streamAll — orderBy tiebreaker', () => {
  it('breaks ties on id, so rows sharing a createdAt cannot be duplicated/skipped across batches', async () => {
    const itemsChain: Record<string, jest.Mock> = {};
    itemsChain.from = jest.fn(() => itemsChain);
    itemsChain.where = jest.fn(() => itemsChain);
    itemsChain.orderBy = jest.fn(() => itemsChain);
    itemsChain.limit = jest.fn(() => itemsChain);
    itemsChain.offset = jest.fn(() => Promise.resolve([]));
    const select = jest.fn(() => itemsChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new CustomersRepository({ withTenant } as never);

    const gen = repo.streamAll(TENANT_ID, {});
    await gen.next();

    const orderByArgs = itemsChain.orderBy.mock.calls[0] as unknown[];
    expect(orderByArgs).toHaveLength(2);
    expect(extractOrderByColumnNames(orderByArgs[1])).toContain('id');
  });
});

// ---------------------------------------------------------------------------
// overview() — GET /customers/:id/overview
// ---------------------------------------------------------------------------

/**
 * The exact order `overview()` issues its 12 queries in. The fake `select`
 * hands back one chain per call, so this list IS the wiring — if a query is
 * added, moved or removed, these tests fail loudly rather than silently
 * feeding the wrong rows into the wrong section.
 */
const OVERVIEW_QUERIES = [
  'customer',
  'projects',
  'quotations',
  'proformas',
  'contracts',
  'invoices',
  'payments',
  'assets',
  'maintenance',
  'invoiced',
  'allocated',
  'received',
] as const;

type OverviewQuery = (typeof OVERVIEW_QUERIES)[number];

/**
 * A chain where every builder method returns itself and the chain itself is
 * awaitable — so it does not matter whether the repository ends a query on
 * `.limit()`, `.where()` or anything else.
 */
const makeAwaitableChain = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
  };
  for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
    chain[method] = jest.fn(() => chain);
  }
  return chain as Record<string, jest.Mock> & { then: unknown };
};

const overviewRepo = (results: Partial<Record<OverviewQuery, unknown[]>> = {}) => {
  const chains = OVERVIEW_QUERIES.map((key) => {
    const fallback =
      key === 'customer'
        ? [{ id: CUSTOMER_ID }]
        : key === 'invoiced' || key === 'allocated' || key === 'received'
          ? [{ value: '0' }]
          : [];
    return makeAwaitableChain(results[key] ?? fallback);
  });
  const select = jest.fn();
  chains.forEach((chain) => select.mockReturnValueOnce(chain));
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select }),
  );
  const repo = new CustomersRepository({ withTenant } as never);
  const chainFor = (key: OverviewQuery) => chains[OVERVIEW_QUERIES.indexOf(key)]!;
  return { repo, select, chainFor };
};

const projectRow = (n: number, total: string) => ({
  id: `project-${n}`,
  name: `Tower ${n}`,
  status: 'EXECUTION',
  city: 'Addis Ababa',
  contractValueEtb: '1000.00',
  overallTotal: total,
});

describe('CustomersRepository.overview — sections', () => {
  it('caps each section at five rows and reports the FULL count, not the capped length', async () => {
    const { repo, chainFor } = overviewRepo({
      // Seven rows would never come back from the real query (LIMIT 5), but
      // the window count says twelve — `total` must follow the count, not
      // the array.
      projects: [1, 2, 3, 4, 5].map((n) => projectRow(n, '12')),
      assets: [{ id: 'asset-1', category: 'ELEVATOR', buildingName: null, serialNumber: 'SN-1', status: 'ACTIVE', overallTotal: '3' }],
    });

    const result = await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(result.projects!.total).toBe(12);
    expect(result.projects!.recent).toHaveLength(5);
    expect(chainFor('projects').limit).toHaveBeenCalledWith(5);
    // One row shown, three exist — the count is not the array length.
    expect(result.assets!.total).toBe(3);
    expect(result.assets!.recent).toHaveLength(1);
  });

  it('strips the window-count column out of the rows it returns', async () => {
    const { repo } = overviewRepo({ projects: [projectRow(1, '12')] });

    const result = await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(result.projects!.recent[0]).toEqual({
      id: 'project-1',
      name: 'Tower 1',
      status: 'EXECUTION',
      city: 'Addis Ababa',
      contractValueEtb: '1000.00',
    });
    expect(result.projects!.recent[0]).not.toHaveProperty('overallTotal');
  });

  it('issues a fixed 12 queries no matter how many related rows exist — never one per row', async () => {
    const { repo, select } = overviewRepo({
      projects: [1, 2, 3, 4, 5].map((n) => projectRow(n, '4000')),
      quotations: [1, 2, 3, 4, 5].map((n) => ({ id: `q-${n}`, overallTotal: '900' })),
      invoices: [1, 2, 3, 4, 5].map((n) => ({ id: `i-${n}`, overallTotal: '7000' })),
    });

    await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(select).toHaveBeenCalledTimes(OVERVIEW_QUERIES.length);
    expect(OVERVIEW_QUERIES.length).toBe(12);
  });

  it('404s for a customer that does not exist or is soft-deleted, before running any section query', async () => {
    const { repo, select } = overviewRepo({ customer: [] });

    await expect(repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe('CustomersRepository.overview — money', () => {
  it('outstanding is invoiced minus allocated, exact to the cent', async () => {
    const { repo } = overviewRepo({
      invoiced: [{ value: '1234567.89' }],
      allocated: [{ value: '999999.99' }],
    });

    const result = await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(result.invoices!.outstandingEtb).toBe('234567.90');
    // Why decimal.js and not subtraction: the same sum through JS numbers
    // does not even produce the right digits, let alone the trailing cent.
    expect(String(Number('1234567.89') - Number('999999.99'))).not.toBe(
      '234567.90',
    );
  });

  it('keeps full precision at the top of numeric(14,2), where a rounded read would lose cents', async () => {
    const { repo } = overviewRepo({
      invoiced: [{ value: '999999999999.99' }],
      allocated: [{ value: '0.07' }],
      received: [{ value: '888888888888.80' }],
    });

    const result = await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(result.invoices!.outstandingEtb).toBe('999999999999.92');
    // Trailing zero cent survives — String(Number(...)) would print '...8.8'.
    expect(result.payments!.receivedEtb).toBe('888888888888.80');
  });

  it("normalizes Postgres' bare integer sums to two decimals", async () => {
    const { repo } = overviewRepo({
      invoiced: [{ value: '5000' }],
      allocated: [{ value: '0' }],
      received: [{ value: '5000' }],
    });

    const result = await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(result.invoices!.outstandingEtb).toBe('5000.00');
    expect(result.payments!.receivedEtb).toBe('5000.00');
  });

  it('reports a customer in credit as a negative figure rather than flooring at zero', async () => {
    const { repo } = overviewRepo({
      invoiced: [{ value: '1000.00' }],
      allocated: [{ value: '1500.00' }],
    });

    const result = await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(result.invoices!.outstandingEtb).toBe('-500.00');
  });
});

describe('CustomersRepository.overview — a customer with no history', () => {
  it('returns zeroes and empty arrays rather than throwing, with money as "0.00" and never null', async () => {
    const { repo } = overviewRepo();

    const result = await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(result).toEqual({
      projects: { total: 0, recent: [] },
      quotations: { total: 0, recent: [] },
      proformas: { total: 0, recent: [] },
      contracts: { total: 0, recent: [] },
      invoices: { total: 0, recent: [], outstandingEtb: '0.00' },
      payments: { total: 0, recent: [], receivedEtb: '0.00' },
      assets: { total: 0, recent: [] },
      maintenance: { total: 0, recent: [] },
    });
  });

  it('still returns "0.00" when the aggregate rows come back empty entirely', async () => {
    const { repo } = overviewRepo({ invoiced: [], allocated: [], received: [] });

    const result = await repo.overview(TENANT_ID, CUSTOMER_ID, [...OVERVIEW_SECTIONS]);

    expect(result.invoices!.outstandingEtb).toBe('0.00');
    expect(result.payments!.receivedEtb).toBe('0.00');
  });
});
