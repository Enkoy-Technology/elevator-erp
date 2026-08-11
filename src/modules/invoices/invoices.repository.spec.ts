import { ConflictException, NotFoundException } from '@nestjs/common';

import { recomputeCustomerBalance } from '../../common/customer-balance';
import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import { todayIso } from '../../common/business-time';
import { InvoicesRepository } from './invoices.repository';

// Isolates "does this repository method WIRE the balance recompute
// correctly" (asserted here via mockCustomerBalance) from "is the balance
// formula itself correct" (exhaustively covered by customer-balance.spec.ts)
// — mocking the module means these tests don't also have to fake every
// select/update call recomputeCustomerBalance's real implementation makes.
jest.mock('../../common/customer-balance');
const mockCustomerBalance = jest.mocked(recomputeCustomerBalance);

beforeEach(() => {
  mockCustomerBalance.mockClear();
});

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const PROFORMA_ID = '33333333-3333-3333-3333-333333333333';
const PROJECT_ID = '55555555-5555-5555-5555-555555555555';
const CUSTOMER_ID = '66666666-6666-6666-6666-666666666666';
const RATE_VERSION_ID = '77777777-7777-7777-7777-777777777777';
const INVOICE_ID = '88888888-8888-8888-8888-888888888888';

const proformaRow = {
  id: PROFORMA_ID,
  status: 'ISSUED',
  projectId: PROJECT_ID,
  customerId: CUSTOMER_ID,
  subtotalEtb: '100.00',
  vatEtb: '15.00',
  totalEtb: '115.00',
  rateVersionId: RATE_VERSION_ID,
};

/** A fake select chain that is also "thenable" at any step. */
interface SelectChain {
  from: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  groupBy: jest.Mock;
  then: (
    resolve: (value: unknown) => void,
    reject: (err: unknown) => void,
  ) => void;
}

/**
 * A drizzle select query builder is "thenable" at any chain step (awaiting
 * mid-chain resolves it) — this fake replicates that instead of hard-coding
 * one fixed call shape per site, so the same helper covers every
 * .select().from().where()[.orderBy()][.limit()] shape in the repository,
 * including ones that are never awaited at all (e.g. the notExists()
 * subquery in voidInvoice — its chain methods just need to return the
 * chain, since notExists() only stores the object as a raw SQL chunk and
 * never awaits or introspects it in a unit test that never renders SQL).
 */
const makeSelectChain = (rows: unknown[]): SelectChain => {
  const chain = {} as SelectChain;
  chain.from = jest.fn(() => chain);
  chain.leftJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.offset = jest.fn(() => chain);
  chain.groupBy = jest.fn(() => chain);
  chain.then = (resolve, reject) => {
    Promise.resolve(rows).then(resolve, reject);
  };
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

/** Wires a fake `insert().values().returning()` chain, capturing the inserted values. */
const makeInsertChain = (
  returning: unknown[],
  onValues?: (v: unknown) => void,
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn((v: unknown) => {
    onValues?.(v);
    return chain;
  });
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Wires a fake `update().set().where().returning()` chain, capturing the set() values. */
const makeUpdateChain = (
  returning: unknown[],
  onSet?: (v: Record<string, unknown>) => void,
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn((v: Record<string, unknown>) => {
    onSet?.(v);
    return chain;
  });
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

describe('InvoicesRepository.issueFromProforma — one-transaction CAS + claim + insert', () => {
  it('claims a gapless INV number and copies the proforma money columns verbatim', async () => {
    const select = jest
      .fn()
      // 1. load proforma
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      // 2. VAT staleness check — open version matches proforma's rateVersionId
      .mockReturnValueOnce(makeSelectChain([{ id: RATE_VERSION_ID }]))
      // 3. tenant fiscalYearStart
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // 4. project name for the presentational line
      .mockReturnValueOnce(makeSelectChain([{ name: 'Bole Tower' }]));

    let insertedInvoice: Record<string, unknown> = {};
    let insertedLine: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ ...proformaRow, id: INVOICE_ID, invoiceNumber: 'x' }],
          (v) => (insertedInvoice = v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: 'line-1' }],
          (v) => (insertedLine = v as Record<string, unknown>),
        ),
      );

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null);

    expect(mockCustomerBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CUSTOMER_ID,
    );

    const fy = computeFiscalYear(todayIso(), '07-08');
    expect(insertedInvoice.invoiceNumber).toBe(`INV-${fy.label.replace('/', '-')}-0001`);
    expect(insertedInvoice.proformaId).toBe(PROFORMA_ID);
    expect(insertedInvoice.customerId).toBe(CUSTOMER_ID);
    expect(insertedInvoice.projectId).toBe(PROJECT_ID);
    expect(insertedInvoice.subtotalEtb).toBe('100.00');
    expect(insertedInvoice.vatEtb).toBe('15.00');
    expect(insertedInvoice.totalEtb).toBe('115.00');
    expect(insertedInvoice.rateVersionId).toBe(RATE_VERSION_ID);
    expect(insertedInvoice.issuedByUserId).toBe(USER_ID);
    expect(insertedLine.description).toBe('Supply and installation — Bole Tower');
    expect(insertedLine.lineTotalEtb).toBe('100.00');
    expect(result.lines).toHaveLength(1);
  });

  it('throws NotFoundException when the proforma does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws WorkflowTransitionError (409) when the proforma is not ISSUED (e.g. CANCELLED)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ ...proformaRow, status: 'CANCELLED' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws WorkflowTransitionError (409) when the open VAT version does not match the proforma\'s rateVersionId (VAT has rotated since pricing)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      // Open VAT version id differs from proformaRow.rateVersionId.
      .mockReturnValueOnce(makeSelectChain([{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws WorkflowTransitionError (409) when there is no open VAT version at all', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      .mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('reclassifies a unique-constraint violation on insert (double-convert) as ConflictException (409) — real driver shape: code lives on err.cause, not err itself', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      .mockReturnValueOnce(makeSelectChain([{ id: RATE_VERSION_ID }]))
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([{ name: 'Bole Tower' }]));

    const failingInsertChain: Record<string, jest.Mock> = {
      values: jest.fn(() => failingInsertChain),
      returning: jest.fn(() => {
        // Matches drizzle-orm's real DrizzleQueryError shape (errors.js):
        // the pg driver's raw error (carrying `.code`) is wrapped as
        // `.cause`, NOT set directly on the thrown error. A test double
        // that instead set `err.code` directly would never have caught
        // that isUniqueViolation was checking the wrong property — see
        // this function's own doc comment for how this was actually found
        // (a real double-convert 409 in the e2e happy-path suite).
        const cause: Error & { code?: string } = new Error('duplicate key value violates unique constraint "invoices_proforma_uk"');
        cause.code = '23505';
        const err: Error & { cause?: unknown } = new Error('Failed query: insert into "invoices" ...');
        err.cause = cause;
        return Promise.reject(err);
      }),
    };
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(failingInsertChain);

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('InvoicesRepository.createStandalone — claim + insert invoice + lines', () => {
  it('claims a gapless INV number and inserts the invoice with the pre-computed lines', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]));
    let insertedInvoice: Record<string, unknown> = {};
    let insertedLines: unknown;
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 7 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: INVOICE_ID, invoiceNumber: 'x', customerId: CUSTOMER_ID }],
          (v) => (insertedInvoice = v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: 'line-1' }, { id: 'line-2' }],
          (v) => (insertedLines = v),
        ),
      );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const lines = [
      {
        lineNo: 1,
        description: 'Maintenance visit',
        quantity: '3.333',
        unitPriceEtb: '10.00',
        lineTotalEtb: '33.33',
      },
    ];
    const result = await repo.createStandalone(TENANT_ID, USER_ID, {
      customerId: CUSTOMER_ID,
      projectId: null,
      dueDate: null,
      subtotalEtb: '33.33',
      vatEtb: '5.00',
      totalEtb: '38.33',
      rateVersionId: RATE_VERSION_ID,
      lines,
    });

    const fy = computeFiscalYear(todayIso(), '07-08');
    expect(insertedInvoice.invoiceNumber).toBe(`INV-${fy.label.replace('/', '-')}-0007`);
    expect(insertedInvoice.proformaId).toBeNull();
    expect(insertedInvoice.customerId).toBe(CUSTOMER_ID);
    expect(insertedInvoice.subtotalEtb).toBe('33.33');
    expect(insertedInvoice.totalEtb).toBe('38.33');
    expect(Array.isArray(insertedLines)).toBe(true);
    expect((insertedLines as Record<string, unknown>[])[0]?.description).toBe(
      'Maintenance visit',
    );
    expect(result.lines).toHaveLength(2);
    expect(mockCustomerBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CUSTOMER_ID,
    );
  });
});

describe('InvoicesRepository.voidInvoice — only from ISSUED with zero allocations', () => {
  it('voids and stores the reason when the CAS + NOT EXISTS guard succeeds', async () => {
    let setValues: Record<string, unknown> = {};
    const select = jest.fn(() => makeSelectChain([]));
    const update = jest.fn(() =>
      makeUpdateChain(
        [{ id: INVOICE_ID, status: 'VOID', customerId: CUSTOMER_ID }],
        (v) => (setValues = v),
      ),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.voidInvoice(TENANT_ID, INVOICE_ID, 'Issued in error');

    expect(result.status).toBe('VOID');
    expect(setValues.status).toBe('VOID');
    expect(setValues.voidReason).toBe('Issued in error');
    expect(mockCustomerBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CUSTOMER_ID,
    );
  });

  it('throws WorkflowTransitionError (409) when the invoice is not ISSUED or has an allocation (guard fails)', async () => {
    const select = jest.fn(() => makeSelectChain([{ id: INVOICE_ID }]));
    const update = jest.fn(() => makeUpdateChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.voidInvoice(TENANT_ID, INVOICE_ID, 'reason'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws NotFoundException when the invoice does not exist', async () => {
    const select = jest.fn(() => makeSelectChain([]));
    const update = jest.fn(() => makeUpdateChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.voidInvoice(TENANT_ID, INVOICE_ID, 'reason'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InvoicesRepository.patchFiscal — manual ETR mirror, works on any non-VOID status', () => {
  it('sets only the whitelisted fiscal columns present in the patch', async () => {
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() =>
      makeUpdateChain(
        [{ id: INVOICE_ID, fiscalReceiptNumber: 'ETR-1' }],
        (v) => (setValues = v),
      ),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await repo.patchFiscal(TENANT_ID, INVOICE_ID, { fiscalReceiptNumber: 'ETR-1' });

    expect(setValues.fiscalReceiptNumber).toBe('ETR-1');
    expect(setValues.fiscalDeviceSerial).toBeUndefined();
  });

  it('throws WorkflowTransitionError when the invoice is VOID (guard fails)', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([{ id: INVOICE_ID }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.patchFiscal(TENANT_ID, INVOICE_ID, { fiscalNote: 'x' }),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });
});

describe('InvoicesRepository.recomputePaymentStatus', () => {
  it('is a no-op on a VOID invoice — never re-derives status away from VOID', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: INVOICE_ID, status: 'VOID', totalEtb: '115.00', whtEtb: '0.00' }]));
    const update = jest.fn();
    const tx = { select, update } as never;
    const repo = new InvoicesRepository({} as never);

    const result = await repo.recomputePaymentStatus(tx, INVOICE_ID);

    expect(result.status).toBe('VOID');
    expect(update).not.toHaveBeenCalled();
  });

  it('CASes ISSUED -> PARTIALLY_PAID off the actual Σ allocations', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([{ id: INVOICE_ID, status: 'ISSUED', totalEtb: '115.00', whtEtb: '0.00' }]),
      )
      .mockReturnValueOnce(makeSelectChain([{ total: '50.00' }]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() =>
      makeUpdateChain(
        [{ id: INVOICE_ID, status: 'PARTIALLY_PAID' }],
        (v) => (setValues = v),
      ),
    );
    const tx = { select, update } as never;
    const repo = new InvoicesRepository({} as never);

    const result = await repo.recomputePaymentStatus(tx, INVOICE_ID);

    expect(result.status).toBe('PARTIALLY_PAID');
    expect(setValues.status).toBe('PARTIALLY_PAID');
  });

  it('is a no-op (no update call) when the derived status equals the current status', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([{ id: INVOICE_ID, status: 'ISSUED', totalEtb: '115.00', whtEtb: '0.00' }]),
      )
      .mockReturnValueOnce(makeSelectChain([{ total: '0.00' }]));
    const update = jest.fn();
    const tx = { select, update } as never;
    const repo = new InvoicesRepository({} as never);

    const result = await repo.recomputePaymentStatus(tx, INVOICE_ID);

    expect(result.status).toBe('ISSUED');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('InvoicesRepository.findByIdWithLines', () => {
  it('returns the invoice with its lines ordered by lineNo', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: INVOICE_ID, invoiceNumber: 'INV-1' }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 'l1', lineNo: 1 }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.findByIdWithLines(TENANT_ID, INVOICE_ID);

    expect(result?.invoiceNumber).toBe('INV-1');
    expect(result?.lines).toEqual([{ id: 'l1', lineNo: 1 }]);
  });

  it('returns null when the invoice does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(repo.findByIdWithLines(TENANT_ID, INVOICE_ID)).resolves.toBeNull();
  });
});

describe('InvoicesRepository.recordWithholding — Task 3 (3.4)', () => {
  const invoiceRow = {
    id: INVOICE_ID,
    status: 'ISSUED',
    customerId: CUSTOMER_ID,
    totalEtb: '115.00',
    whtEtb: '0.00',
  };

  /** recomputePaymentStatus's own correctness is covered by its own describe block above — spy it out here so these tests only assert the withholding-specific guard + wiring. */
  const stubRecomputePaymentStatus = (
    repo: InvoicesRepository,
  ): jest.SpyInstance =>
    jest
      .spyOn(repo, 'recomputePaymentStatus')
      .mockResolvedValue({ ...invoiceRow, status: 'PAID' } as never);

  it('takes the per-invoice advisory lock before reading the invoice', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() => makeUpdateChain([{ ...invoiceRow, whtEtb: '3.00' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    stubRecomputePaymentStatus(repo);

    await repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' });

    expect(execute).toHaveBeenCalledTimes(1);
    const lockOrder = execute.mock.invocationCallOrder[0]!;
    const selectOrder = select.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(selectOrder);
  });

  it('sets whtEtb/whtVoucherRef/whtRecordedAt as an absolute set, then recomputes status + customer balance', async () => {
    let setValues: Record<string, unknown> = {};
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() =>
      makeUpdateChain([{ ...invoiceRow, whtEtb: '3.00' }], (v) => (setValues = v)),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    const recomputeSpy = stubRecomputePaymentStatus(repo);

    await repo.recordWithholding(TENANT_ID, INVOICE_ID, {
      amountEtb: '3.00',
      voucherRef: 'WHT-001',
      recordedAt: '2026-09-01T00:00:00Z',
    });

    expect(setValues.whtEtb).toBe('3.00');
    expect(setValues.whtVoucherRef).toBe('WHT-001');
    expect(setValues.whtRecordedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
    expect(recomputeSpy).toHaveBeenCalledWith(expect.anything(), INVOICE_ID);
    expect(mockCustomerBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CUSTOMER_ID,
    );
  });

  it('voucherRef omitted -> stored as null; recordedAt omitted -> defaults to now', async () => {
    let setValues: Record<string, unknown> = {};
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() =>
      makeUpdateChain([{ ...invoiceRow, whtEtb: '3.00' }], (v) => (setValues = v)),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    stubRecomputePaymentStatus(repo);

    const before = Date.now();
    await repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' });
    const after = Date.now();

    expect(setValues.whtVoucherRef).toBeNull();
    expect(setValues.whtRecordedAt).toBeInstanceOf(Date);
    const recordedAtMs = (setValues.whtRecordedAt as Date).getTime();
    expect(recordedAtMs).toBeGreaterThanOrEqual(before);
    expect(recordedAtMs).toBeLessThanOrEqual(after);
  });

  it('boundary: allocated 112 + wht 3.00 == total 115.00 passes (not strictly over)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() => makeUpdateChain([{ ...invoiceRow, whtEtb: '3.00' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    stubRecomputePaymentStatus(repo);

    await expect(
      repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' }),
    ).resolves.toBeDefined();
  });

  it('boundary: allocated 112 + wht 3.01 exceeds total 115.00 by one cent -> ConflictException (409), never a silent clamp', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.01' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a VOID invoice', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ ...invoiceRow, status: 'VOID' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' }),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('404s when the invoice does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InvoicesRepository.agingReport — Task 3 (3.6)', () => {
  const TODAY = todayIso();

  it('buckets outstanding amounts per customer, excluding invoices with <= 0 outstanding and VOID invoices', async () => {
    const rows = [
      // Fully paid — outstanding 0, must be excluded.
      {
        invoiceId: 'inv-paid',
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        totalEtb: '100.00',
        whtEtb: '0.00',
        dueDate: TODAY,
        issuedAt: new Date(),
      },
      // 40 days overdue, 60.00 outstanding.
      {
        invoiceId: 'inv-overdue',
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        totalEtb: '60.00',
        whtEtb: '0.00',
        dueDate: daysAgoIso(40),
        issuedAt: new Date(),
      },
    ];
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain(rows))
      .mockReturnValueOnce(
        makeSelectChain([{ invoiceId: 'inv-paid', total: '100.00' }]),
      );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.agingReport(TENANT_ID);

    expect(result).toEqual([
      {
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        current: '0.00',
        d1_30: '0.00',
        d31_60: '60.00',
        d61_90: '0.00',
        d90_plus: '0.00',
        total: '60.00',
      },
    ]);
  });

  it('returns an empty array (and skips the allocation query) when there are no non-VOID invoices', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(repo.agingReport(TENANT_ID)).resolves.toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
  });
});

/** ISO date string N days before business-time "today", for aging fixtures. */
function daysAgoIso(days: number): string {
  const d = new Date(`${todayIso()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
