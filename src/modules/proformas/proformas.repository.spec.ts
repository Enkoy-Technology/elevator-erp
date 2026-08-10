import { NotFoundException } from '@nestjs/common';

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
  subtotalEtb: '100.00',
  taxAmountEtb: '15.00',
  totalPriceEtb: '115.00',
  rateVersionId: RATE_VERSION_ID,
};

/** Wires a fake `update().set().where().returning()` chain. */
const makeUpdateChain = (returning: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Wires a fake `select().from().where().limit()` chain. */
const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
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
  it('CASes the quotation, claims a gapless number, and inserts the immutable money snapshot', async () => {
    const update = jest.fn(() => makeUpdateChain([quoteRow]));
    const select = jest.fn(() =>
      makeSelectChain([{ fiscalYearStart: '07-08' }]),
    );
    let insertedProforma: Record<string, unknown> = {};
    const seqChain = makeSeqInsertChain([{ nextValue: 1 }]);
    const proformaChain = makeProformaInsertChain(
      (v) => (insertedProforma = v),
      [{ id: 'pf-1' }],
    );
    const insert = jest
      .fn()
      .mockReturnValueOnce(seqChain)
      .mockReturnValueOnce(proformaChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select, insert }),
    );
    const repo = new ProformasRepository({ withTenant } as never);

    await repo.issue(TENANT_ID, USER_ID, QUOTE_ID, null);

    // Money snapshot: proforma column names (subtotalEtb/vatEtb/totalEtb) map
    // from the quotation's own names (subtotalEtb/taxAmountEtb/totalPriceEtb).
    expect(insertedProforma.subtotalEtb).toBe('100.00');
    expect(insertedProforma.vatEtb).toBe('15.00');
    expect(insertedProforma.totalEtb).toBe('115.00');
    expect(insertedProforma.rateVersionId).toBe(RATE_VERSION_ID);
    expect(insertedProforma.projectId).toBe(PROJECT_ID);
    expect(insertedProforma.customerId).toBe(CUSTOMER_ID);
    expect(insertedProforma.quotationId).toBe(QUOTE_ID);
    expect(insertedProforma.issuedByUserId).toBe(USER_ID);
    expect(insertedProforma.status).toBe('ISSUED');

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
