import { NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import { todayIso } from '../../common/business-time';
import { ProformasRepository } from './proformas.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const QUOTE_ID = '44444444-4444-4444-4444-444444444444';
const PROJECT_ID = '55555555-5555-5555-5555-555555555555';
const CUSTOMER_ID = '66666666-6666-6666-6666-666666666666';
const RATE_VERSION_ID = '77777777-7777-7777-7777-777777777777';

const quoteRow = {
  id: QUOTE_ID,
  projectId: PROJECT_ID,
  customerId: CUSTOMER_ID,
  // Self-consistent by construction: 100.00 base + 20.00 margin = 120.00
  // ex-VAT, 15% of which is 18.00, giving 138.00. The proforma's subtotal is
  // derived as totalPriceEtb - taxAmountEtb, so a fixture whose columns did
  // not add up could not tell a correct derivation from a broken one.
  subtotalEtb: '100.00',
  marginAmountEtb: '20.00',
  taxAmountEtb: '18.00',
  totalPriceEtb: '138.00',
  rateVersionId: RATE_VERSION_ID,
  technicalSpec: { capacityPersons: 13 },
  pricingBreakdown: { baseCost: '80.00', subtotalWithMargin: '120.00' },
};

/** Wires a fake `update().set().where().returning()` chain. */
const makeUpdateChain = (returning: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/**
 * Wires a fake `select().from().where().orderBy().limit()` chain (orderBy is
 * optional in the real call chain, but always chainable here).
 *
 * The chain is THENABLE, because Drizzle's query builder is: a query that
 * ends at `.orderBy()` is awaited directly, with no `.limit()` to hang the
 * promise off. The payment-terms read in `issue()` is exactly that shape,
 * and without `then` here it awaited to the chain object itself and failed
 * with "terms.map is not a function".
 */
const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> & {
    then?: (onFulfilled: (rows: unknown[]) => unknown) => Promise<unknown>;
  } = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  chain.then = (onFulfilled) => Promise.resolve(rows).then(onFulfilled);
  return chain;
};

/**
 * Wires the `insert(proformaLines).values([...])` bulk copy, which is awaited
 * directly with no `.returning()` — hence thenable, like the real builder.
 */
const makeLinesInsertChain = (onValues: (v: unknown) => void = () => {}) => {
  const chain: Record<string, jest.Mock> & {
    then?: (onFulfilled: (v: unknown) => unknown) => Promise<unknown>;
  } = {};
  chain.values = jest.fn((v: unknown) => {
    onValues(v);
    return chain;
  });
  chain.then = (onFulfilled) => Promise.resolve(undefined).then(onFulfilled);
  return chain;
};

/** Wires a fake `insert().values().onConflictDoUpdate().returning()` chain (document_sequences claim). */
const makeSeqInsertChain = (returning: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn(() => chain);
  chain.onConflictDoUpdate = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Wires a fake `insert().values().returning()` chain (proforma insert), capturing the inserted values. */
const makeProformaInsertChain = (
  onValues: (v: Record<string, unknown>) => void,
  returning: unknown[],
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn((v: Record<string, unknown>) => {
    onValues(v);
    return chain;
  });
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

describe('ProformasRepository.issue — one-transaction CAS + claim + insert', () => {
  it('CASes the quotation, claims a gapless number, and inserts the immutable money + spec snapshot', async () => {
    const update = jest.fn(() => makeUpdateChain([quoteRow]));
    // Two distinct select calls in issue(): the VAT-staleness check (returns
    // the open version matching the quote's rateVersionId), then the
    // tenant's fiscalYearStart lookup.
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: RATE_VERSION_ID }]))
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // 3rd select: autoAdvanceProject reading the project's current stage,
      // inside this same transaction (QUOTATION -> PROFORMA).
      .mockReturnValue(makeSelectChain([{ status: 'QUOTATION' }]));
    let insertedProforma: Record<string, unknown> = {};
    const seqChain = makeSeqInsertChain([{ lastValue: 1 }]);
    const proformaChain = makeProformaInsertChain(
      (v) => (insertedProforma = v),
      [{ id: 'pf-1' }],
    );
    const insert = jest
      .fn()
      .mockReturnValueOnce(seqChain)
      .mockReturnValueOnce(proformaChain)
      // 3rd insert: the proforma_lines copy of the quotation's lines.
      .mockReturnValue(makeLinesInsertChain());
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select, insert }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await repo.issue(TENANT_ID, USER_ID, QUOTE_ID, null);

    // Money snapshot: subtotalEtb is the TAXABLE BASE, derived as
    // totalPriceEtb - taxAmountEtb rather than read off
    // pricingBreakdown.subtotalWithMargin. On an un-negotiated quotation the
    // two agree; on a negotiated one only the subtraction is right, because
    // subtotalWithMargin still holds the pre-negotiation figure (see the
    // negotiated-quotation test below). vatEtb/totalEtb map straight from
    // the quotation's own names (taxAmountEtb/totalPriceEtb).
    expect(insertedProforma.subtotalEtb).toBe('120.00');
    expect(insertedProforma.vatEtb).toBe('18.00');
    expect(insertedProforma.totalEtb).toBe('138.00');
    expect(insertedProforma.rateVersionId).toBe(RATE_VERSION_ID);
    expect(insertedProforma.projectId).toBe(PROJECT_ID);
    expect(insertedProforma.customerId).toBe(CUSTOMER_ID);
    expect(insertedProforma.quotationId).toBe(QUOTE_ID);
    expect(insertedProforma.issuedByUserId).toBe(USER_ID);
    expect(insertedProforma.status).toBe('ISSUED');
    // technicalSpec/pricingBreakdown are copied onto the proforma's own
    // snapshot columns at issue time (see the 0034 migration).
    expect(insertedProforma.technicalSpec).toEqual(quoteRow.technicalSpec);
    expect(insertedProforma.pricingBreakdown).toEqual(quoteRow.pricingBreakdown);

    const fy = computeFiscalYear(todayIso(), '07-08');
    expect(insertedProforma.fiscalYearLabel).toBe(fy.label);
    expect(insertedProforma.proformaNumber).toBe(
      `PF-${fy.label.replace('/', '-')}-0001`,
    );
  });

  it('throws WorkflowTransitionError (409) when the quotation is not APPROVED', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([{ id: QUOTE_ID }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await expect(
      repo.issue(TENANT_ID, USER_ID, QUOTE_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws NotFoundException when the quotation does not exist', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await expect(
      repo.issue(TENANT_ID, USER_ID, QUOTE_ID, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws WorkflowTransitionError (409) when the open VAT version does not match the quotation\'s rateVersionId (VAT has rotated since pricing)', async () => {
    const update = jest.fn(() => makeUpdateChain([quoteRow]));
    // Open VAT version id differs from quoteRow.rateVersionId.
    const select = jest.fn(() =>
      makeSelectChain([{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }]),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await expect(
      repo.issue(TENANT_ID, USER_ID, QUOTE_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws WorkflowTransitionError (409) when there is no open VAT version at all', async () => {
    const update = jest.fn(() => makeUpdateChain([quoteRow]));
    const select = jest.fn(() => makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await expect(
      repo.issue(TENANT_ID, USER_ID, QUOTE_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('derives subtotalEtb as total minus VAT, never by summing subtotalEtb+marginAmountEtb — counterexample: 100.00 + 26.00 = 126.00, but the real taxable base is 126.01', async () => {
    // subtotalEtb (100.00) + marginAmountEtb (26.00) — two independently
    // rounded 2dp columns — sum to 126.00, a cent short of the real,
    // full-precision taxable base (126.01) VAT was actually computed from.
    // Deriving as totalPriceEtb - taxAmountEtb (144.91 - 18.90) recovers
    // 126.01 exactly; summing the two rounded columns would print 126.00
    // and leave the customer's document a cent out of balance.
    const fractionalQuoteRow = {
      ...quoteRow,
      subtotalEtb: '100.00',
      marginAmountEtb: '26.00',
      taxAmountEtb: '18.90',
      totalPriceEtb: '144.91',
      pricingBreakdown: { subtotalWithMargin: '126.01' },
    };
    const update = jest.fn(() => makeUpdateChain([fractionalQuoteRow]));
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: RATE_VERSION_ID }]))
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // 3rd select: autoAdvanceProject reading the project's current stage,
      // inside this same transaction (QUOTATION -> PROFORMA).
      .mockReturnValue(makeSelectChain([{ status: 'QUOTATION' }]));
    let insertedProforma: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeProformaInsertChain((v) => (insertedProforma = v), [{ id: 'pf-1' }]),
      )
      .mockReturnValue(makeLinesInsertChain());
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select, insert }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await repo.issue(TENANT_ID, USER_ID, QUOTE_ID, null);

    expect(insertedProforma.subtotalEtb).toBe('126.01');
    expect(insertedProforma.vatEtb).toBe('18.90');
    expect(insertedProforma.totalEtb).toBe('144.91');
    expect(
      new Decimal(insertedProforma.subtotalEtb as string)
        .plus(insertedProforma.vatEtb as string)
        .toFixed(2),
    ).toBe(insertedProforma.totalEtb);
  });

  it('carries the NEGOTIATED figures, not the pre-negotiation subtotalWithMargin', async () => {
    // The whole reason subtotalEtb is derived rather than copied. A sales
    // manager quoted a round 7,835,000.00 against a calculator that said
    // 8,521,500.00, so pricingBreakdown still holds the stale, higher
    // subtotalWithMargin. Copying it would issue the customer a proforma
    // whose ex-VAT line disagrees with the total they actually agreed.
    const negotiated = {
      ...quoteRow,
      taxAmountEtb: '1021956.52',
      totalPriceEtb: '7835000.00',
      pricingBreakdown: { subtotalWithMargin: '7410000.00' },
    };
    const update = jest.fn(() => makeUpdateChain([negotiated]));
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: RATE_VERSION_ID }]))
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValue(makeSelectChain([{ status: 'QUOTATION' }]));
    let insertedProforma: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeProformaInsertChain((v) => (insertedProforma = v), [{ id: 'pf-1' }]),
      )
      .mockReturnValue(makeLinesInsertChain());
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select, insert }),
    );

    await new ProformasRepository({ withTenant } as never).issue(
      TENANT_ID,
      USER_ID,
      QUOTE_ID,
      null,
    );

    expect(insertedProforma.subtotalEtb).toBe('6813043.48');
    expect(insertedProforma.vatEtb).toBe('1021956.52');
    expect(insertedProforma.totalEtb).toBe('7835000.00');
    // The invariant an auditor checks, on the customer's own copy.
    expect(
      new Decimal(insertedProforma.subtotalEtb as string)
        .plus(insertedProforma.vatEtb as string)
        .toFixed(2),
    ).toBe(insertedProforma.totalEtb);
  });
});

describe('ProformasRepository.cancel — CAS ISSUED -> CANCELLED', () => {
  const PROFORMA_ID = '88888888-8888-8888-8888-888888888888';

  it('sets status CANCELLED and stores the reason', async () => {
    let setValues: Record<string, unknown> = {};
    const chain: Record<string, jest.Mock> = {};
    chain.set = jest.fn((v: Record<string, unknown>) => {
      setValues = v;
      return chain;
    });
    chain.where = jest.fn(() => chain);
    chain.returning = jest.fn(() =>
      Promise.resolve([{ id: PROFORMA_ID, status: 'CANCELLED' }]),
    );
    const update = jest.fn(() => chain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await expect(
      repo.cancel(TENANT_ID, PROFORMA_ID, 'Customer withdrew'),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(setValues.status).toBe('CANCELLED');
    expect(setValues.cancelReason).toBe('Customer withdrew');
  });

  it('throws WorkflowTransitionError when the proforma is already CANCELLED', async () => {
    const updateChain = makeUpdateChain([]);
    const update = jest.fn(() => updateChain);
    const selectChain = makeSelectChain([{ id: PROFORMA_ID }]);
    const select = jest.fn(() => selectChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await expect(
      repo.cancel(TENANT_ID, PROFORMA_ID, 'Duplicate cancel'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws NotFoundException when the proforma does not exist', async () => {
    const updateChain = makeUpdateChain([]);
    const update = jest.fn(() => updateChain);
    const selectChain = makeSelectChain([]);
    const select = jest.fn(() => selectChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await expect(
      repo.cancel(TENANT_ID, PROFORMA_ID, 'reason'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProformasRepository.findByIdForDocument — joined display names + the proforma\'s own snapshot columns', () => {
  const PROFORMA_ID = '88888888-8888-8888-8888-888888888888';

  it('joins customers and projects (for display names only) and returns the row — technicalSpec/pricingBreakdown come from the proforma\'s own columns, no quotations join', async () => {
    const joinedRow = {
      id: PROFORMA_ID,
      proformaNumber: 'PF-FY2026-27-0001',
      customerName: 'Acme',
      projectName: 'Bole Tower',
      technicalSpec: { capacityPersons: 13 },
      pricingBreakdown: { baseCost: '80000.00' },
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
    const repo = new ProformasRepository({ withTenant } as never);

    const result = await repo.findByIdForDocument(TENANT_ID, PROFORMA_ID);

    expect(result).toEqual(joinedRow);
    // Two leftJoins: customers, projects — each with a real ON condition
    // passed (not an implicit/missing join predicate, which drizzle would
    // otherwise happily accept as a cross join). No quotations join: that
    // table can keep changing after conversion, so technicalSpec/
    // pricingBreakdown come from the proforma's own snapshot columns
    // instead (getTableColumns(proformas), see issue()'s doc comment).
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
    const repo = new ProformasRepository({ withTenant } as never);

    await expect(
      repo.findByIdForDocument(TENANT_ID, PROFORMA_ID),
    ).resolves.toBeNull();
  });
});

describe('ProformasRepository.issue — project stage auto-advance', () => {
  /** issue()'s full happy-path tx, with the project sitting at `projectStatus`. */
  const runIssue = async (projectStatus: string) => {
    const setValues: Record<string, unknown>[] = [];
    const update = jest.fn(() => {
      const chain: Record<string, jest.Mock> = {};
      chain.set = jest.fn((v: Record<string, unknown>) => {
        setValues.push(v);
        return chain;
      });
      chain.where = jest.fn(() => chain);
      chain.returning = jest.fn(() => Promise.resolve([quoteRow]));
      return chain;
    });
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: RATE_VERSION_ID }]))
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValue(makeSelectChain([{ status: projectStatus }]));
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeProformaInsertChain(() => {}, [{ id: 'pf-1', projectId: PROJECT_ID }]),
      )
      .mockReturnValue(makeLinesInsertChain());
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select, insert }),
    );
    const repo = new ProformasRepository({ withTenant } as never);
    const row = await repo.issue(TENANT_ID, USER_ID, QUOTE_ID, null);
    return { row, setValues, withTenant };
  };

  it('advances the project to PROFORMA in the issue transaction', async () => {
    const { setValues, withTenant } = await runIssue('QUOTATION');

    // One transaction for the quotation CAS, the proforma insert and the
    // stage move together — an issued proforma can never commit next to a
    // project that failed to advance.
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(setValues).toContainEqual(
      expect.objectContaining({ status: 'PROFORMA' }),
    );
  });

  it.each(['CONTRACT', 'COMPLETED', 'CANCELLED'])(
    'still issues the proforma when the project is %s and the stage cannot move',
    async (projectStatus) => {
      const { row, setValues } = await runIssue(projectStatus);

      expect(row).toMatchObject({ id: 'pf-1' });
      expect(setValues).not.toContainEqual(
        expect.objectContaining({ status: 'PROFORMA' }),
      );
    },
  );
});
