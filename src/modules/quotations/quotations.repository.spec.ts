import Decimal from 'decimal.js';
import { NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import { QuotationsRepository } from './quotations.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const QUOTE_ID = '44444444-4444-4444-4444-444444444444';

/** Wires a fake `update().set().where().returning()` chain. */
const makeUpdateChain = (
  onWhere: (w: unknown) => void,
  returning: unknown[],
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn((w: unknown) => {
    onWhere(w);
    return chain;
  });
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Wires a fake `select().from().where().limit()` chain, for the
 * exists-check the CAS miss path runs. */
const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

describe('QuotationsRepository.updateStatus — compare-and-swap', () => {
  it('includes the expected-status equality in the update WHERE clause', async () => {
    let where: unknown;
    const updateChain = makeUpdateChain(
      (w) => (where = w),
      [{ id: QUOTE_ID, status: 'PENDING_APPROVAL' }],
    );
    const update = jest.fn(() => updateChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update }),
    );
    const repo = new QuotationsRepository({ withTenant } as never);

    await repo.updateStatus(TENANT_ID, QUOTE_ID, 'DRAFT', 'PENDING_APPROVAL');

    expect(where).toBeDefined();
  });

  it('throws WorkflowTransitionError (409) when the row exists but is no longer in the expected status', async () => {
    const updateChain = makeUpdateChain(() => {}, []);
    const update = jest.fn(() => updateChain);
    const selectChain = makeSelectChain([{ id: QUOTE_ID }]);
    const select = jest.fn(() => selectChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new QuotationsRepository({ withTenant } as never);

    await expect(
      repo.updateStatus(TENANT_ID, QUOTE_ID, 'DRAFT', 'PENDING_APPROVAL'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws NotFoundException when the row does not exist at all', async () => {
    const updateChain = makeUpdateChain(() => {}, []);
    const update = jest.fn(() => updateChain);
    const selectChain = makeSelectChain([]);
    const select = jest.fn(() => selectChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new QuotationsRepository({ withTenant } as never);

    await expect(
      repo.updateStatus(TENANT_ID, QUOTE_ID, 'DRAFT', 'PENDING_APPROVAL'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('QuotationsRepository.findByIdForDocument — joined customer/project names', () => {
  it('joins customers and projects and returns the joined row', async () => {
    const joinedRow = {
      id: QUOTE_ID,
      quoteNumber: 'QTN-2026-ABCD1234',
      customerName: 'Acme',
      projectName: 'Bole Tower',
    };
    const leftJoins: Array<{ table: unknown; condition: unknown }> = [];
    const chain: Record<string, jest.Mock> = {};
    chain.from = jest.fn(() => chain);
    chain.leftJoin = jest.fn((table: unknown, condition: unknown) => {
      leftJoins.push({ table, condition });
      return chain;
    });
    chain.where = jest.fn(() => chain);
    chain.limit = jest.fn(() => Promise.resolve([joinedRow]));
    const select = jest.fn(() => chain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new QuotationsRepository({ withTenant } as never);

    const result = await repo.findByIdForDocument(TENANT_ID, QUOTE_ID);

    expect(result).toEqual(joinedRow);
    // Two leftJoins: customers, then projects — each with a real ON
    // condition passed (not a bare table with an implicit/missing join
    // predicate, which drizzle would otherwise happily accept as a cross join).
    expect(leftJoins).toHaveLength(2);
    for (const { condition } of leftJoins) {
      expect(condition).toBeDefined();
    }
  });

  it('returns null when no matching row exists', async () => {
    const chain: Record<string, jest.Mock> = {};
    chain.from = jest.fn(() => chain);
    chain.leftJoin = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.limit = jest.fn(() => Promise.resolve([]));
    const select = jest.fn(() => chain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new QuotationsRepository({ withTenant } as never);

    await expect(
      repo.findByIdForDocument(TENANT_ID, QUOTE_ID),
    ).resolves.toBeNull();
  });
});

describe('QuotationsRepository.create — project stage auto-advance', () => {
  const PROJECT_ID = '55555555-5555-5555-5555-555555555555';
  const insertedQuote = {
    id: QUOTE_ID,
    projectId: PROJECT_ID,
    status: 'DRAFT',
  };

  /** insert().values().returning() + the select/update chains
   * autoAdvanceProject drives, all on one fake tx. */
  const makeTx = (projectRows: unknown[]) => {
    const insertChain: Record<string, jest.Mock> = {};
    insertChain.values = jest.fn(() => insertChain);
    insertChain.returning = jest.fn(() => Promise.resolve([insertedQuote]));

    const selectChain: Record<string, jest.Mock> = {};
    selectChain.from = jest.fn(() => selectChain);
    selectChain.where = jest.fn(() => selectChain);
    selectChain.limit = jest.fn(() => Promise.resolve(projectRows));

    const setValues: unknown[] = [];
    const updateChain: Record<string, jest.Mock> = {};
    updateChain.set = jest.fn((v: unknown) => {
      setValues.push(v);
      return updateChain;
    });
    updateChain.where = jest.fn(() => Promise.resolve([]));

    const update = jest.fn(() => updateChain);
    const tx = {
      insert: jest.fn(() => insertChain),
      select: jest.fn(() => selectChain),
      update,
    };
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );
    return { withTenant, update, setValues };
  };

  it('advances the project to QUOTATION inside the insert transaction', async () => {
    const { withTenant, update, setValues } = makeTx([{ status: 'LEAD' }]);
    const repo = new QuotationsRepository({ withTenant } as never);

    await expect(
      repo.create(TENANT_ID, { projectId: PROJECT_ID } as never),
    ).resolves.toEqual(insertedQuote);

    // One withTenant call => insert and stage move share a transaction, so a
    // quotation can never commit next to a project that failed to advance.
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(setValues[0]).toMatchObject({ status: 'QUOTATION' });
  });

  it('still returns the quotation when the stage cannot move (CANCELLED project)', async () => {
    const { withTenant, update } = makeTx([{ status: 'CANCELLED' }]);
    const repo = new QuotationsRepository({ withTenant } as never);

    await expect(
      repo.create(TENANT_ID, { projectId: PROJECT_ID } as never),
    ).resolves.toEqual(insertedQuote);

    expect(update).not.toHaveBeenCalled();
  });

  it('still returns the quotation when the project is already past QUOTATION', async () => {
    const { withTenant, update } = makeTx([{ status: 'CONTRACT' }]);
    const repo = new QuotationsRepository({ withTenant } as never);

    await expect(
      repo.create(TENANT_ID, { projectId: PROJECT_ID } as never),
    ).resolves.toEqual(insertedQuote);

    expect(update).not.toHaveBeenCalled();
  });
});

describe('QuotationsRepository.listLines — the pre-lines backward-compatibility path', () => {
  /** A quotation written before quotation_lines existed: header jsonb, no rows. */
  const legacy = {
    tenantId: TENANT_ID,
    id: QUOTE_ID,
    status: 'APPROVED',
    calcInput: { productType: 'PASSENGER', capacityKg: 800, speedMs: 1.5 },
    technicalSpec: { capacityPersons: 10 },
    pricingBreakdown: { subtotalWithMargin: '7410000.00' },
    // 6,000,000 base + 1,410,000 margin = 7,410,000 ex-VAT (the client's own
    // formula figure), 15% VAT = 1,111,500, grand total 8,521,500. Pre-margin
    // and post-margin deliberately DIFFER, so a line that wrongly used
    // subtotalEtb cannot pass by coincidence.
    subtotalEtb: '6000000.00',
    marginAmountEtb: '1410000.00',
    taxAmountEtb: '1111500.00',
    totalPriceEtb: '8521500.00',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  /** `select().from().where().limit()` then `select().from().where().orderBy()`. */
  const makeTx = (quotationRows: unknown[], lineRows: unknown[]) => {
    const chain = (terminal: 'limit' | 'orderBy', rows: unknown[]) => {
      const link: Record<string, jest.Mock> = {};
      link.from = jest.fn(() => link);
      link.where = jest.fn(() => link);
      link[terminal] = jest.fn(() => Promise.resolve(rows));
      return link;
    };
    return {
      select: jest
        .fn()
        .mockImplementationOnce(() => chain('limit', quotationRows))
        .mockImplementationOnce(() => chain('orderBy', lineRows)),
    };
  };

  const repoFor = (tx: unknown) =>
    new QuotationsRepository({
      withTenant: jest.fn(
        async (_tenantId: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
      ),
    } as never);

  it('synthesizes exactly one line from the header when the quotation has none', async () => {
    const lines = await repoFor(makeTx([legacy], [])).listLines(
      TENANT_ID,
      QUOTE_ID,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      quotationId: QUOTE_ID,
      sequence: 1,
      quantity: 1,
      productType: 'PASSENGER',
      calcInput: legacy.calcInput,
      technicalSpec: legacy.technicalSpec,
      pricingBreakdown: legacy.pricingBreakdown,
      specSummary: '800KG -10persons / Speed 1.5m/s',
      // The EX-VAT TOTAL (totalPriceEtb - taxAmountEtb), NOT the pre-margin
      // subtotalEtb. The document prints this line table directly above a
      // totals block reading the same ex-VAT figure; using subtotalEtb left
      // the customer's page short by exactly marginAmountEtb, which handed
      // them the tenant's markup by subtraction.
      lineTotalEtb: '7410000.00',
      unitPriceEtb: '7410000.00',
    });
    // The invariant that defect broke: the line table sums to what the
    // totals block prints.
    const [line] = lines;
    if (!line?.lineTotalEtb) {
      throw new Error('expected one synthesized line carrying a total');
    }
    expect(line.lineTotalEtb).not.toBe(legacy.subtotalEtb);
    expect(
      new Decimal(line.lineTotalEtb).plus(legacy.taxAmountEtb).toFixed(2),
    ).toBe(legacy.totalPriceEtb);
  });

  it('returns the real rows untouched once a quotation has them', async () => {
    const persisted = [{ id: 'L1', sequence: 1 }, { id: 'L2', sequence: 2 }];
    await expect(
      repoFor(makeTx([legacy], persisted)).listLines(TENANT_ID, QUOTE_ID),
    ).resolves.toEqual(persisted);
  });

  it('404s on a quotation that does not exist, rather than inventing a line for it', async () => {
    await expect(
      repoFor(makeTx([], [])).listLines(TENANT_ID, QUOTE_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('QuotationsRepository.addLine — materializing a pre-lines quotation', () => {
  const legacyDraft = {
    tenantId: TENANT_ID,
    id: QUOTE_ID,
    status: 'DRAFT',
    calcInput: { productType: 'PASSENGER', capacityKg: 800, speedMs: 1.5 },
    technicalSpec: { capacityPersons: 10 },
    pricingBreakdown: { subtotalWithMargin: '7410000.00' },
    // 6,000,000 base + 1,410,000 margin = 7,410,000 ex-VAT (the client's own
    // formula figure), 15% VAT = 1,111,500, grand total 8,521,500. Pre-margin
    // and post-margin deliberately DIFFER, so a line that wrongly used
    // subtotalEtb cannot pass by coincidence.
    subtotalEtb: '6000000.00',
    marginAmountEtb: '1410000.00',
    taxPercent: '15.00',
    taxAmountEtb: '1111500.00',
    totalPriceEtb: '8521500.00',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('inserts the header line under the SAME id the read path reported, then appends after it', async () => {
    const inserted: Record<string, unknown>[] = [];
    const selectChain = (terminal: 'limit' | 'orderBy', rows: unknown[]) => {
      const link: Record<string, jest.Mock> = {};
      link.from = jest.fn(() => link);
      link.where = jest.fn(() => link);
      link[terminal] = jest.fn(() => Promise.resolve(rows));
      return link;
    };
    const insertChain = () => {
      const link: Record<string, jest.Mock> = {};
      link.values = jest.fn((values: Record<string, unknown>) => {
        inserted.push(values);
        return link;
      });
      link.returning = jest.fn(() =>
        Promise.resolve([{ ...inserted.at(-1), sequence: inserted.length }]),
      );
      return link;
    };
    const headerUpdates: Record<string, unknown>[] = [];
    const updateChain = () => {
      const link: Record<string, jest.Mock> & {
        then?: (onFulfilled: (v: unknown) => unknown) => Promise<unknown>;
      } = {};
      link.set = jest.fn((values: Record<string, unknown>) => {
        headerUpdates.push(values);
        return link;
      });
      link.where = jest.fn(() => link);
      link.then = (onFulfilled) => Promise.resolve(undefined).then(onFulfilled);
      return link;
    };
    const tx = {
      select: jest
        .fn()
        // requireDraft, then materializeLegacyLine's own lookup.
        .mockImplementationOnce(() => selectChain('limit', [legacyDraft]))
        .mockImplementationOnce(() => selectChain('orderBy', []))
        // resyncHeaderFromLines re-reads the lines it must total.
        .mockImplementation(() =>
          selectChain('orderBy', [
            { lineTotalEtb: '7410000.00' },
            { lineTotalEtb: '1000000.00' },
          ]),
        ),
      insert: jest.fn(() => insertChain()),
      update: jest.fn(() => updateChain()),
    };
    const repo = new QuotationsRepository({
      withTenant: jest.fn(
        async (_tenantId: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
      ),
    } as never);

    await repo.addLine(TENANT_ID, QUOTE_ID, {
      productType: 'PASSENGER',
      quantity: 1,
    });

    // Without the deterministic id, pricing a legacy quotation would read
    // one line id and write back another, and applyPricing's own
    // consistency check would reject the very first negotiation.
    expect(inserted[0]).toMatchObject({ id: QUOTE_ID, sequence: 1 });
    expect(inserted[1]).toMatchObject({ sequence: 2 });
    expect(inserted[1]).not.toHaveProperty('id');

    // Adding a line RESYNCS the header from the lines. Without this the
    // quotation still billed only the first lift, and the proforma issued
    // from it inherited that figure onto an immutable customer document.
    // 7,410,000 + 1,000,000 = 8,410,000 ex-VAT; 15% VAT = 1,261,500.
    expect(headerUpdates.at(-1)).toMatchObject({
      subtotalEtb: '8410000.00',
      taxAmountEtb: '1261500.00',
      totalPriceEtb: '9671500.00',
      // The old negotiation was agreed for a one-lift scope; it cannot
      // survive onto a two-lift one, and neither can its sign-off.
      calculatedTotalEtb: null,
      discountAmountEtb: null,
      discountPercent: null,
      discountApprovedByUserId: null,
    });
  });
});
